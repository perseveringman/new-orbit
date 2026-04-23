import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC } from '@shared/ipc';
import type { AppSettings, DiagnosticsInfo, Theme, VaultInfo, VaultResult } from '@shared/types';
import { createVault, isVault, openVault } from './vault';
import { ensureVision, excerptFromBody, readVision, writeVision } from './vision';
import { getSettings, setLastVaultPath, setTheme, updateSettings } from './settings';
import { closeFsSession, openFsSession, registerFsIpc } from './fs';
import {
  ensureTerminalAgentRuntimeForVault,
  handleTerminalPaneExited,
  reconcileOnStart,
  registerAgentIpc
} from './agent/ipc';
import { registerGitIpc } from './git/ipc';
import { registerGitHubIpc } from './github/ipc';
import { registerEnvIpc } from './env/ipc';
import { registerDistillIpc, ensureVectorStore, closeVectorStore } from './distill/ipc';
import { registerR6Ipc, startDailyReviewScheduler } from './r6_ipc';
import * as terminal from './terminal/pty_manager';
import { runWorktreeGc, startWorktreeGcScheduler } from './worktree_gc';
import {
  crashLogFile,
  installMainCrashHandlers,
  writeCrashRecord,
  type CrashOrigin
} from './crash';
import { detectClaude, resetDetectCache } from './agent/cli';

// --- userData override (for e2e + isolation) ---
// If ORBIT_USER_DATA is set before app is ready, point Electron's userData
// there. Keeps production behavior untouched; gives tests a sandbox.
if (process.env['ORBIT_USER_DATA']) {
  try {
    app.setPath('userData', process.env['ORBIT_USER_DATA']);
  } catch {
    /* ignore */
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let currentVault: VaultInfo | null = null;

// Install crash handlers as early as possible.
installMainCrashHandlers({
  getVaultPath: () => currentVault?.path ?? null,
  userData: app.getPath('userData'),
  version: app.getVersion()
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0b0d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function notImplemented(): never {
  throw new Error('not implemented');
}
void notImplemented;

async function pickDirectory(mode: 'open' | 'create'): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: mode === 'open' ? 'Open Orbit vault' : 'Choose folder for new Orbit vault',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0] ?? null;
}

async function handlePickAndOpen(): Promise<VaultResult> {
  const dir = await pickDirectory('open');
  if (!dir) return { ok: false, reason: 'cancelled' };
  try {
    if (!(await isVault(dir))) {
      return {
        ok: false,
        reason: 'invalid',
        message: 'Selected folder is not an Orbit vault (.orbit/config.json missing).'
      };
    }
    const vault = await openVault(dir);
    currentVault = vault;
    terminal.setVaultRoot(vault.path);
    await setLastVaultPath(dir);
    await ensureVision(dir);
    await openFsSession(dir);
    await reconcileOnStart(dir);
    await ensureTerminalAgentRuntimeForVault(dir);
    void ensureVectorStore(dir);
    void runWorktreeGc(dir).catch(() => undefined);
    return { ok: true, vault };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}

async function handleCreateNew(): Promise<VaultResult> {
  const dir = await pickDirectory('create');
  if (!dir) return { ok: false, reason: 'cancelled' };
  try {
    const vault = await createVault(dir);
    currentVault = vault;
    terminal.setVaultRoot(vault.path);
    await setLastVaultPath(dir);
    await openFsSession(dir);
    await reconcileOnStart(dir);
    await ensureTerminalAgentRuntimeForVault(dir);
    void ensureVectorStore(dir);
    return { ok: true, vault };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}

async function handleOpenPath(_: unknown, dir: string): Promise<VaultResult> {
  try {
    if (!(await isVault(dir))) {
      return { ok: false, reason: 'invalid', message: 'Path is not an Orbit vault.' };
    }
    const vault = await openVault(dir);
    currentVault = vault;
    terminal.setVaultRoot(vault.path);
    await setLastVaultPath(dir);
    await ensureVision(dir);
    await openFsSession(dir);
    await reconcileOnStart(dir);
    await ensureTerminalAgentRuntimeForVault(dir);
    void ensureVectorStore(dir);
    return { ok: true, vault };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}

function registerTerminalIpc(): void {
  ipcMain.handle(
    IPC.terminal.open,
    async (_e, args: terminal.OpenSessionArgs) => {
      if (currentVault) {
        const runtime = await ensureTerminalAgentRuntimeForVault(currentVault.path);
        const nextArgs: terminal.OpenSessionArgs = {
          ...args,
          env: {
            ...(args.env ?? {}),
            ORBIT_HOOK_PORT: String(runtime.port)
          }
        };
        return terminal.openSession(nextArgs);
      }
      return terminal.openSession(args);
    }
  );
  ipcMain.handle(IPC.terminal.write, (_e, id: string, data: string) => {
    terminal.write(id, data);
  });
  ipcMain.handle(IPC.terminal.resize, (_e, id: string, cols: number, rows: number) => {
    terminal.resize(id, cols, rows);
  });
  ipcMain.handle(IPC.terminal.kill, async (_e, id: string) => {
    await terminal.kill(id);
  });
  ipcMain.handle(IPC.terminal.list, () => terminal.list());

  const broadcast = (channel: string, payload: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send(channel, payload);
        } catch {
          /* ignore */
        }
      }
    }
  };

  terminal.on('data', (id, data) => broadcast(IPC.terminal.data, { id, data }));
  terminal.on('exit', (id, payload) =>
    {
      if (payload.paneId) {
        void handleTerminalPaneExited(
          payload.paneId,
          payload.projectUid,
          payload.projectSlug
        );
      }
      broadcast(IPC.terminal.exit, {
        id,
        exitCode: payload.exitCode,
        signal: payload.signal,
        ...(payload.paneId ? { paneId: payload.paneId } : {}),
        ...(payload.projectUid ? { projectUid: payload.projectUid } : {}),
        ...(payload.projectSlug ? { projectSlug: payload.projectSlug } : {})
      });
    }
  );
}

function registerIpc(): void {
  // workspace
  ipcMain.handle(IPC.workspace.pickAndOpen, () => handlePickAndOpen());
  ipcMain.handle(IPC.workspace.createNew, () => handleCreateNew());
  ipcMain.handle(IPC.workspace.openPath, handleOpenPath);
  ipcMain.handle(IPC.workspace.current, () => currentVault);
  ipcMain.handle(IPC.workspace.close, async () => {
    currentVault = null;
    await terminal.killAll();
    terminal.setVaultRoot(null);
    await closeVectorStore();
    await closeFsSession();
    await setLastVaultPath(null);
  });
  ipcMain.handle(IPC.workspace.crashLogPath, () =>
    crashLogFile(currentVault?.path ?? null, app.getPath('userData'))
  );
  ipcMain.handle(IPC.workspace.reportCrash, async (_e, rec: {
    origin: CrashOrigin;
    message: string;
    stack?: string;
    extra?: Record<string, unknown>;
  }) => {
    return writeCrashRecord(
      {
        ts: new Date().toISOString(),
        origin: rec.origin,
        version: app.getVersion(),
        message: rec.message,
        stack: rec.stack,
        extra: rec.extra
      },
      { vaultPath: currentVault?.path ?? null, userData: app.getPath('userData') }
    );
  });
  ipcMain.handle(IPC.workspace.revealUserData, async () => {
    await shell.openPath(app.getPath('userData'));
  });
  ipcMain.handle(IPC.workspace.revealVaultOrbit, async () => {
    if (!currentVault) return;
    await shell.openPath(path.join(currentVault.path, '.orbit'));
  });
  ipcMain.handle(IPC.workspace.diagnostics, async (): Promise<DiagnosticsInfo> => {
    const s = await getSettings();
    let cliPath: string | null = null;
    let cliVer: string | null = null;
    try {
      const det = await detectClaude();
      if (det.available) {
        cliPath = det.path ?? null;
        cliVer = det.version ?? null;
      } else {
        cliPath = det.path ?? (s.claudePath || null);
      }
    } catch {
      cliPath = s.claudePath || null;
    }
    return {
      version: app.getVersion(),
      os: `${process.platform} ${process.getSystemVersion?.() ?? ''}`.trim(),
      arch: process.arch,
      electron: process.versions['electron'] ?? '',
      node: process.versions.node,
      vaultPath: currentVault?.path ?? null,
      claudePath: cliPath,
      claudeVersion: cliVer,
      crashLogPath: crashLogFile(currentVault?.path ?? null, app.getPath('userData')),
      userDataPath: app.getPath('userData')
    };
  });

  // settings
  ipcMain.handle(IPC.settings.get, () => getSettings());
  ipcMain.handle(IPC.settings.setTheme, (_e, theme: Theme) => setTheme(theme));
  ipcMain.handle(IPC.settings.update, (_e, partial: Partial<AppSettings>) =>
    updateSettings(partial)
  );
  ipcMain.handle(IPC.settings.detectClaude, () => {
    resetDetectCache();
    return detectClaude(true);
  });

  registerFsIpc();
  registerAgentIpc();
  registerGitIpc();
  registerGitHubIpc();
  registerEnvIpc();
  registerDistillIpc();
  registerTerminalIpc();
  registerR6Ipc();
  startDailyReviewScheduler();
  startWorktreeGcScheduler(() => currentVault?.path ?? null);

  // vision
  ipcMain.handle(IPC.vision.get, async () => {
    if (!currentVault) return { exists: false, raw: '', body: '', data: {}, excerpt: '' };
    const v = await readVision(currentVault.path);
    return { ...v, excerpt: excerptFromBody(v.body) };
  });
  ipcMain.handle(IPC.vision.update, async (_e, raw: string) => {
    if (!currentVault) throw new Error('no vault open');
    const v = await writeVision(currentVault.path, raw);
    return { ...v, excerpt: excerptFromBody(v.body) };
  });
}

app.whenReady().then(async () => {
  registerIpc();
  // attempt to auto-open last vault unless the user opted out.
  try {
    const settings = await getSettings();
    if (
      settings.reopenLastVault &&
      settings.lastVaultPath &&
      (await isVault(settings.lastVaultPath))
    ) {
      currentVault = await openVault(settings.lastVaultPath);
      terminal.setVaultRoot(currentVault.path);
      await ensureVision(settings.lastVaultPath);
      await openFsSession(settings.lastVaultPath);
      await reconcileOnStart(settings.lastVaultPath);
      await ensureTerminalAgentRuntimeForVault(settings.lastVaultPath);
      void ensureVectorStore(settings.lastVaultPath);
      void runWorktreeGc(settings.lastVaultPath).catch(() => undefined);
    }
  } catch {
    currentVault = null;
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
