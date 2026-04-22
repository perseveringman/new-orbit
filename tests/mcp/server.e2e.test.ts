import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createVault } from '../../src/main/vault';
import { createProject } from '../../src/main/project';

const SERVER_PATH = path.resolve(__dirname, '../../out/mcp/server.cjs');

interface Reply {
  jsonrpc: '2.0';
  id: number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Spawn the bundled MCP server, send each request, then resolve with the
 * collected NDJSON replies once `expected` lines have arrived (or after a
 * 5s safety timeout). The child is always killed before the promise
 * settles.
 */
function exchange(
  env: NodeJS.ProcessEnv,
  requests: object[],
  expected: number
): Promise<Reply[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER_PATH], { env });
    const replies: Reply[] = [];
    let buf = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          `mcp e2e timeout after ${replies.length}/${expected} replies; stderr=${stderr}`
        )
      );
    }, 5000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buf += chunk;
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line.length > 0) {
          try {
            replies.push(JSON.parse(line) as Reply);
          } catch {
            /* ignore non-JSON debug noise */
          }
        }
        nl = buf.indexOf('\n');
      }
      if (replies.length >= expected) {
        clearTimeout(timer);
        child.kill();
        resolve(replies);
      }
    });
    child.stderr.on('data', (b: Buffer) => (stderr += b.toString('utf8')));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    for (const req of requests) child.stdin.write(JSON.stringify(req) + '\n');
  });
}

const HAVE_BUILD = existsSync(SERVER_PATH);

beforeAll(() => {
  if (!HAVE_BUILD) {
    // The standalone bundle must exist for these e2e tests. The build
    // script is `npm run build:mcp` and is part of `npm run build` so
    // CI normally has it in place; if missing we attempt a one-shot
    // build to avoid spurious failures during local `npm test`.
    const r = spawnSync('npm', ['run', 'build:mcp'], {
      cwd: path.resolve(__dirname, '../..'),
      stdio: 'inherit'
    });
    if (r.status !== 0) {
      throw new Error('mcp e2e: build:mcp failed; cannot run server.cjs');
    }
  }
});

describe('mcp server.cjs — end-to-end', () => {
  let vault: string;
  beforeEach(async () => {
    vault = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-mcp-e2e-'));
    await createVault(vault);
  });
  afterEach(async () => {
    await fs.rm(vault, { recursive: true, force: true });
  });

  it('answers initialize + tools/list with all seven Orbit tools', async () => {
    const proj = await createProject(vault, {
      slug: 'demo',
      template: 'blank',
      name: 'Demo'
    });
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ORBIT_VAULT_PATH: vault,
      ORBIT_PROJECT_UID: proj.uid,
      ORBIT_PROJECT_SLUG: 'demo'
    };
    const replies = await exchange(
      env,
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' }
      ],
      2
    );
    expect(replies[0]!.result).toMatchObject({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'orbit', version: '0.1.0' }
    });
    const tools = (replies[1]!.result as {
      tools: { name: string }[];
    }).tools.map((t) => t.name).sort();
    expect(tools).toEqual(
      [
        'append_execution_log',
        'checkpoint_commit',
        'create_task',
        'get_vision',
        'log_thinking',
        'search_global_context',
        'update_task_status'
      ].sort()
    );
  });

  it('exits non-zero when env vars missing', async () => {
    await new Promise<void>((resolve) => {
      // Preserve PATH so `node` resolves; just clear the ORBIT_* vars.
      const env: NodeJS.ProcessEnv = { ...process.env };
      delete env['ORBIT_VAULT_PATH'];
      delete env['ORBIT_PROJECT_UID'];
      delete env['ORBIT_PROJECT_SLUG'];
      const child = spawn('node', [SERVER_PATH], { env });
      child.on('exit', (code) => {
        expect(code).toBe(1);
        resolve();
      });
    });
  });

  it('end-to-end create_task tool/call lands a real file under .agent/tasks/', async () => {
    const proj = await createProject(vault, {
      slug: 'e2e',
      template: 'blank',
      name: 'E2E'
    });
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ORBIT_VAULT_PATH: vault,
      ORBIT_PROJECT_UID: proj.uid,
      ORBIT_PROJECT_SLUG: 'e2e'
    };
    const replies = await exchange(
      env,
      [
        { jsonrpc: '2.0', id: 1, method: 'initialize' },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: { title: 'Smoke Test', description: 'from e2e' }
          }
        }
      ],
      2
    );
    const r = replies[1]!.result as {
      content: { text: string }[];
      isError: boolean;
    };
    expect(r.isError).toBe(false);
    const payload = JSON.parse(r.content[0]!.text) as {
      uid: string;
      path: string;
    };
    const raw = await fs.readFile(payload.path, 'utf8');
    expect(raw).toContain('# Description');
    expect(raw).toContain(`project_uid: ${proj.uid}`);
  });
});
