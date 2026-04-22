export interface HookTemplateOpts {
  hookPort: number;
  hookToken: string;
  hookVersion: number;
  runId: string;
  worktreeId?: string;
  vendor?: string;
}

/** Returns a portable bash script that reads stdin JSON and POSTs to the
 *  local Orbit hook server. curl is assumed available on macOS. */
export function renderNotifyShTemplate(opts: HookTemplateOpts): string {
  const port = JSON.stringify(opts.hookPort);
  const token = JSON.stringify(opts.hookToken);
  const version = JSON.stringify(opts.hookVersion);
  const runId = JSON.stringify(opts.runId);
  const worktreeId = JSON.stringify(opts.worktreeId ?? '');
  const vendor = JSON.stringify(opts.vendor ?? 'generic');

  return `#!/usr/bin/env bash
set -eu

ORBIT_HOOK_PORT=${port}
ORBIT_HOOK_TOKEN=${token}
ORBIT_HOOK_VERSION=${version}
ORBIT_RUN_ID=${runId}
ORBIT_WORKTREE_ID=${worktreeId}
ORBIT_VENDOR=${vendor}
ORBIT_EVENT_TYPE="\${ORBIT_HOOK_EVENT_TYPE:-Stop}"

payload="$(cat)"
if [ -z "\${payload}" ]; then
  payload='{}'
fi

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

body=$(ORBIT_EVENT_TYPE="\${ORBIT_EVENT_TYPE}" \\
       ORBIT_TS="\${ts}" \\
       PAYLOAD="\${payload}" \\
  /usr/bin/env node -e '
const p = process.env;
const payload = JSON.parse(p.PAYLOAD || "{}");
process.stdout.write(JSON.stringify({
  version: Number(p.ORBIT_HOOK_VERSION),
  runId: p.ORBIT_RUN_ID,
  worktreeId: p.ORBIT_WORKTREE_ID || undefined,
  eventType: p.ORBIT_EVENT_TYPE,
  payload,
  ts: p.ORBIT_TS
}));
' 2>/dev/null) || body=$(printf '{"version":%s,"runId":%s,"worktreeId":%s,"eventType":%s,"payload":{},"ts":%s}' \\
  "\${ORBIT_HOOK_VERSION}" \\
  '"\${ORBIT_RUN_ID}"' \\
  '"\${ORBIT_WORKTREE_ID}"' \\
  '"\${ORBIT_EVENT_TYPE}"' \\
  '"\${ts}"')

curl -fsS --max-time 3 \\
  -X POST \\
  -H "Authorization: Bearer \${ORBIT_HOOK_TOKEN}" \\
  -H "Content-Type: application/json" \\
  --data "\${body}" \\
  "http://127.0.0.1:\${ORBIT_HOOK_PORT}/hook" >/dev/null || true
`;
}

interface ClaudeSettingsOpts extends HookTemplateOpts {
  scriptPath: string;
}

export function renderClaudeSettingsJson(opts: ClaudeSettingsOpts): string {
  const command = opts.scriptPath;
  const settings = {
    hooks: {
      Start: [
        {
          hooks: [
            {
              type: 'command',
              command,
              env: { ORBIT_HOOK_EVENT_TYPE: 'Start' }
            }
          ]
        }
      ],
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command,
              env: { ORBIT_HOOK_EVENT_TYPE: 'Stop' }
            }
          ]
        }
      ],
      PreToolUse: [
        {
          hooks: [
            {
              type: 'command',
              command,
              env: { ORBIT_HOOK_EVENT_TYPE: 'PermissionRequest' }
            }
          ]
        }
      ]
    }
  };
  return JSON.stringify(settings, null, 2);
}
