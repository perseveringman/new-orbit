import { spawn, type spawn as nodeSpawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit, type SimpleGit, type SimpleGitFactory } from 'simple-git';
import type { CheckReport, SecretFinding } from '@shared/git';

export interface CheckDeps {
  spawner?: typeof nodeSpawn;
  gitFactory?: SimpleGitFactory;
  /** Millisecond timeout for `npm run build`. Default 10 minutes. */
  buildTimeoutMs?: number;
}

const DEFAULT_BUILD_TIMEOUT_MS = 10 * 60 * 1000;

interface BuildResult {
  ok: boolean;
  exitCode: number | null;
  logTail: string;
  skipped?: boolean;
}

/**
 * Run `npm run build` if the worktree has a package.json with a `build`
 * script. Skipped (ok=true, skipped=true) when no build script exists.
 */
export async function runBuildCheck(
  cwd: string,
  deps: CheckDeps = {}
): Promise<BuildResult> {
  const pkgPath = path.join(cwd, 'package.json');
  let pkg: unknown;
  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  } catch {
    return { ok: true, exitCode: 0, logTail: '', skipped: true };
  }
  const scripts =
    pkg && typeof pkg === 'object' && 'scripts' in (pkg as object)
      ? ((pkg as { scripts?: Record<string, string> }).scripts ?? {})
      : {};
  if (!scripts['build']) {
    return { ok: true, exitCode: 0, logTail: '', skipped: true };
  }

  const spawner = deps.spawner ?? spawn;
  const timeoutMs = deps.buildTimeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS;
  return new Promise<BuildResult>((resolve) => {
    let buf = '';
    const child = spawner('npm', ['run', 'build'], {
      cwd,
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const onData = (c: Buffer | string): void => {
      buf += String(c);
      if (buf.length > 100_000) buf = buf.slice(buf.length - 100_000);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, timeoutMs);
    timer.unref?.();
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, exitCode: null, logTail: tail(buf) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, exitCode: code ?? null, logTail: tail(buf) });
    });
  });
}

function tail(buf: string, lines = 60): string {
  const parts = buf.split(/\r?\n/);
  return parts.slice(-lines).join('\n');
}

// --- secret scanner ---------------------------------------------------------

interface SecretRule {
  name: string;
  re: RegExp;
}

const SECRET_RULES: SecretRule[] = [
  { name: 'aws_access_key', re: /AKIA[0-9A-Z]{16}/ },
  {
    name: 'aws_secret',
    re: /aws(?:.{0,20})?(?:secret|sk)(?:.{0,20})?[=:][^\s'"]+/i
  },
  { name: 'github_token', re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: 'slack_token', re: /xox[abpr]-[A-Za-z0-9-]{10,}/ },
  {
    name: 'private_key',
    re: /-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/
  },
  {
    name: 'anthropic_api_key',
    re: /ANTHROPIC_API_KEY\s*[=:]\s*["']?([A-Za-z0-9_-]{20,})/
  },
  {
    name: 'openai_api_key',
    re: /OPENAI_API_KEY\s*[=:]\s*["']?([A-Za-z0-9_-]{20,})/
  },
  {
    name: 'google_api_key',
    re: /GOOGLE_API_KEY\s*[=:]\s*["']?([A-Za-z0-9_-]{20,})/
  }
];

export interface SecretScanResult {
  ok: boolean;
  findings: SecretFinding[];
}

/**
 * Scan the unified diff of a ghost branch vs its base. Only lines that
 * are **additions** (lead with `+`, but not `+++`) are inspected so we
 * ignore pre-existing matches that merely appear in context lines.
 */
export function scanDiff(diff: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  if (!diff) return findings;
  const lines = diff.split(/\r?\n/);
  let currentFile = '';
  let newLineNo = 0;
  for (const line of lines) {
    if (line.startsWith('+++ ')) {
      // "+++ b/path/to/file" — strip the "b/" prefix when present.
      const p = line.slice(4).trim();
      currentFile = p.startsWith('b/') ? p.slice(2) : p;
      newLineNo = 0;
      continue;
    }
    if (line.startsWith('--- ')) continue;
    const h = line.match(/^@@ .* \+(\d+)(?:,\d+)? @@/);
    if (h) {
      newLineNo = Number.parseInt(h[1] ?? '1', 10);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const payload = line.slice(1);
      for (const rule of SECRET_RULES) {
        if (rule.re.test(payload)) {
          findings.push({
            file: currentFile || '(unknown)',
            line: newLineNo,
            rule: rule.name
          });
        }
      }
      newLineNo += 1;
    } else if (!line.startsWith('-')) {
      newLineNo += 1;
    }
  }
  return findings;
}

/**
 * Run the secret scanner over the diff of a worktree's HEAD vs its merge
 * base with `base`.
 */
export async function runSecretScan(
  cwd: string,
  base: string,
  deps: CheckDeps = {}
): Promise<SecretScanResult> {
  const g: SimpleGit = (deps.gitFactory ?? simpleGit)(cwd);
  let diff = '';
  try {
    diff = await g.raw(['diff', '--unified=0', `${base}...HEAD`]);
  } catch {
    return { ok: true, findings: [] };
  }
  const findings = scanDiff(diff);
  return { ok: findings.length === 0, findings };
}

/**
 * Run the full pre-merge check. Captures current HEAD sha so the
 * IPC layer can cache + invalidate by sha.
 */
export async function runPreMergeCheck(
  cwd: string,
  base: string,
  deps: CheckDeps = {}
): Promise<CheckReport> {
  const g: SimpleGit = (deps.gitFactory ?? simpleGit)(cwd);
  let headSha = '';
  try {
    headSha = (await g.raw(['rev-parse', 'HEAD'])).trim();
  } catch {
    // ignore — report will lack a sha
  }
  const [build, secrets] = await Promise.all([
    runBuildCheck(cwd, deps),
    runSecretScan(cwd, base, deps)
  ]);
  const report: CheckReport = {
    build,
    secrets,
    at: new Date().toISOString()
  };
  if (headSha) report.headSha = headSha;
  return report;
}
