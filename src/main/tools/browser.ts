import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import type { AuthorityRequest } from '@shared/authority';
import { currentSession } from '../fs';
import { authorityBlockedResult, evaluateVaultAuthority } from '../authority/runtime';
import { cliServerError } from '../cli_server/errors';
import { assertPublicNetworkTarget, parsePublicHttpUrl } from '../web-tools/safety';

const MAX_BODY_CHARS = 30_000;
const DEFAULT_BODY_CHARS = 12_000;
const sessions = new Map<string, BrowserWindow>();

interface BrowserOpenParams {
  url?: unknown;
  wait_ms?: unknown;
}

interface BrowserSnapshotParams {
  session_id?: unknown;
  max_chars?: unknown;
}

interface BrowserCloseParams {
  session_id?: unknown;
}

export async function openBrowserTool(rawParams: unknown): Promise<unknown> {
  const session = currentSession();
  if (!session) throw cliServerError('no_vault', 'No Orbit vault is open.');
  const params = asObject<BrowserOpenParams>(rawParams, 'browser.open');
  if (typeof params.url !== 'string') throw cliServerError('invalid_params', 'url is required');
  const url = parsePublicHttpUrl(params.url);
  await assertPublicNetworkTarget(url);

  const request: AuthorityRequest = {
    toolFamily: 'browser',
    toolName: 'orbit_browser_open',
    domain: url.hostname,
    browserAction: 'open',
    permissions: ['read', 'network'],
    risk: 'L0_observe',
    summary: `Open rendered browser page ${url.toString()}`
  };
  const decision = await evaluateVaultAuthority(session.vault, request, 'research');
  if (decision.effect !== 'allow') return authorityBlockedResult(request, decision);

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  const sessionId = `browser-${randomUUID()}`;
  sessions.set(sessionId, win);
  win.once('closed', () => sessions.delete(sessionId));
  await win.webContents.loadURL(url.toString());
  const waitMs = clampNumber(params.wait_ms, 0, 5000, 0);
  if (waitMs > 0) await wait(waitMs);
  return {
    ok: true,
    sessionId,
    url: win.webContents.getURL(),
    title: win.webContents.getTitle(),
    authority: decision
  };
}

export async function snapshotBrowserTool(rawParams: unknown): Promise<unknown> {
  const session = currentSession();
  if (!session) throw cliServerError('no_vault', 'No Orbit vault is open.');
  const params = asObject<BrowserSnapshotParams>(rawParams, 'browser.snapshot');
  const sessionId = requireString(params.session_id, 'session_id');
  const win = getSessionWindow(sessionId);
  const maxChars = clampNumber(params.max_chars, 1000, MAX_BODY_CHARS, DEFAULT_BODY_CHARS);
  const currentUrl = new URL(win.webContents.getURL());
  const request: AuthorityRequest = {
    toolFamily: 'browser',
    toolName: 'orbit_browser_snapshot',
    domain: currentUrl.hostname,
    browserAction: 'snapshot',
    permissions: ['read'],
    risk: 'L0_observe',
    summary: `Snapshot rendered browser page ${currentUrl.toString()}`
  };
  const decision = await evaluateVaultAuthority(session.vault, request, 'research');
  if (decision.effect !== 'allow') return authorityBlockedResult(request, decision);

  const snapshot = await win.webContents.executeJavaScript(
    `(() => {
      const maxChars = ${JSON.stringify(maxChars)};
      const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 80).map((anchor) => ({
        text: clean(anchor.textContent).slice(0, 180),
        href: anchor.href
      }));
      return {
        title: document.title || '',
        url: location.href,
        bodyText: (document.body?.innerText || '').slice(0, maxChars),
        links
      };
    })()`,
    true
  ) as { title: string; url: string; bodyText: string; links: Array<{ text: string; href: string }> };

  return {
    ok: true,
    sessionId,
    ...snapshot,
    truncated: snapshot.bodyText.length >= maxChars,
    authority: decision
  };
}

export async function closeBrowserTool(rawParams: unknown): Promise<unknown> {
  const params = asObject<BrowserCloseParams>(rawParams, 'browser.close');
  const sessionId = requireString(params.session_id, 'session_id');
  const win = getSessionWindow(sessionId);
  sessions.delete(sessionId);
  if (!win.isDestroyed()) win.close();
  return { ok: true, sessionId };
}

function asObject<T>(rawParams: unknown, method: string): T {
  if (!rawParams || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
    throw cliServerError('invalid_params', `${method} params must be an object`);
  }
  return rawParams as T;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw cliServerError('invalid_params', `${field} is required`);
  }
  return value;
}

function getSessionWindow(sessionId: string): BrowserWindow {
  const win = sessions.get(sessionId);
  if (!win || win.isDestroyed()) throw cliServerError('not_found', `browser session not found: ${sessionId}`);
  return win;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
