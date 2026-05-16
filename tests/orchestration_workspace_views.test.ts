import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EvidenceSource, ExternalAISessionSettings } from '../src/shared/evidence';
import type { DispatchSnapshot } from '../src/shared/orchestration';
import type { SDKEndpointRegistrySnapshot } from '../src/shared/runtime';
import type { ExternalSessionDistillPayload, SynthesisArtifact } from '../src/shared/synthesis';
import { AgentsLibrarySurface } from '../src/renderer/src/views/AgentsLibraryView';
import { RuntimeSessionsView } from '../src/renderer/src/views/RuntimeSessionsView';
import { RuntimesWorkspaceSurface } from '../src/renderer/src/views/RuntimesWorkspaceView';

const noop = vi.fn();

const sdkSnapshot: SDKEndpointRegistrySnapshot = {
  defaults: { ask: 'anthropic' },
  endpoints: [
    {
      id: 'anthropic',
      label: 'Anthropic',
      provider: 'anthropic',
      protocol: 'anthropic-compatible',
      baseURL: 'https://api.anthropic.com',
      defaultModel: 'claude-3-5-sonnet-latest',
      enabled: true,
      builtIn: true,
      keyConfigured: true,
      keyMasked: 'sk••••test'
    }
  ]
};

const externalSessionSettings: ExternalAISessionSettings = {
  enabled: true,
  limit: 80,
  roots: [{ agent: 'claude', dir: '/Users/example/.claude/projects', enabled: true }],
  includeAgents: [],
  excludeAgents: [],
  includeProjects: [],
  excludeProjects: [],
  includePathSubstrings: [],
  excludePathSubstrings: [],
  indexLevel: 'safe_projection',
  includeToolOutputs: false
};

const externalSession: EvidenceSource = {
  id: 'external_ai_session:claude:pmil-1',
  kind: 'external_ai_session',
  ownership: 'reference',
  title: 'PMIL local agent strategy',
  summary: 'Discussed local AI sessions as PMIL truth sources.',
  provider_id: 'claude',
  canonical_ref: '/Users/example/.claude/projects/new-orbit/session.jsonl',
  updated_at: '2026-05-16T10:00:00.000Z',
  observed_at: '2026-05-16T10:00:00.000Z',
  fingerprint: { algorithm: 'sha256', value: 'hash-1' },
  availability: 'available',
  privacy: {
    index_level: 'safe_projection',
    allow_synthesis: true,
    allow_tool_outputs: false
  },
  metadata: { agent: 'claude', project_name: 'new-orbit' }
};

const externalSessionSummary: SynthesisArtifact<ExternalSessionDistillPayload> = {
  id: 'artifact-session-1',
  kind: 'distill.external_session',
  scope_key: 'distill.external_session:external_ai_session:claude:pmil-1',
  sources: [],
  provenance: {
    runtime: 'local:heuristic',
    model: 'deterministic',
    prompt_version: 'v1',
    generated_at: '2026-05-16T10:00:00.000Z'
  },
  payload: {
    source_id: externalSession.id,
    title: externalSession.title,
    agent: 'claude',
    project_ref: 'new-orbit',
    summary: 'PMIL should keep local agent sessions as truth sources and summarize them on demand.',
    key_points: ['reference-truth', 'safe projection'],
    decisions: [],
    open_loops: [{ title: 'Add runtime-side visibility', evidence: [] }],
    next_actions: ['Show local AI sessions near Runtime'],
    entities: ['PMIL'],
    evidence: [],
    source_hash: 'hash-1'
  },
  status: 'fresh',
  created_at: '2026-05-16T10:00:00.000Z'
};

const snapshot: DispatchSnapshot = {
  refreshedAt: '2026-04-25T02:00:00.000Z',
  runtimes: [
    {
      runtimeId: 'claude:/usr/local/bin/claude',
      mode: 'local',
      provider: 'claude',
      name: 'claude local runtime',
      binaryPath: '/usr/local/bin/claude',
      version: '1.0.0',
      status: 'online',
      discoveredAt: '2026-04-25T01:00:00.000Z',
      lastSeenAt: '2026-04-25T02:00:00.000Z',
      capabilities: {
        supportsResume: true,
        supportsHooks: true,
        supportsWorktree: true,
        supportsBackgroundRuns: true,
        supportsLongContext: true
      },
      limits: {
        maxConcurrentRuns: 4
      }
    }
  ],
  templates: [
    {
      id: 'role-template-executor',
      slug: 'executor',
      name: 'Executor',
      kind: 'builtin',
      latestVersionId: 'role-template-executor-v1',
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z'
    }
  ],
  templateVersions: [
    {
      id: 'role-template-executor-v1',
      templateId: 'role-template-executor',
      version: 1,
      instructions: 'Execute tasks carefully.',
      skillRefs: ['implementation', 'validation'],
      providerPreferences: ['claude'],
      defaultConcurrency: 2,
      defaultDispatchMode: 'autonomous',
      allowAutonomous: true,
      outputStyle: 'implementation-report',
      createdAt: '2026-04-25T00:00:00.000Z'
    }
  ],
  bindings: [
    {
      id: 'binding-1',
      projectUid: 'project-1',
      templateId: 'role-template-executor',
      templateVersionId: 'role-template-executor-v1',
      dispatchMode: 'autonomous',
      health: 'healthy',
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z'
    }
  ],
  leases: [
    {
      leaseId: 'lease-1',
      taskId: 'file:task-1',
      taskUid: 'task-1',
      runtimeId: 'claude:/usr/local/bin/claude',
      bindingId: 'binding-1',
      ownerType: 'binding',
      ownerId: 'binding-1',
      status: 'running',
      claimedAt: '2026-04-25T02:00:00.000Z',
      runId: 'run-1',
      reportId: 'report-1'
    }
  ],
  reports: [
    {
      reportId: 'report-1',
      projectUid: 'project-1',
      taskId: 'file:task-1',
      taskUid: 'task-1',
      title: 'Implement runtime page',
      bindingId: 'binding-1',
      runtimeId: 'claude:/usr/local/bin/claude',
      runId: 'run-1',
      status: 'running',
      summary: 'Executor is wiring the runtime workspace.',
      details: ['Opened runtime registry', 'Rendering list/detail workspace'],
      createdAt: '2026-04-25T02:00:00.000Z',
      updatedAt: '2026-04-25T02:05:00.000Z'
    }
  ]
};

describe('orchestration workspace surfaces', () => {
  it('renders the runtime control plane with registry and leases', () => {
    const html = renderToStaticMarkup(
      createElement(RuntimesWorkspaceSurface, {
        snapshot,
        sdkSnapshot,
        externalSessions: [externalSession],
        externalSessionSettings,
        externalSessionSummaries: { [externalSession.id]: externalSessionSummary },
        loading: false,
        projects: [{ uid: 'project-1', name: 'Moonshot' }],
        selectedRuntimeId: 'claude:/usr/local/bin/claude',
        onRefresh: noop,
        onSelectRuntime: noop,
        onOpenProjectRoles: noop
      })
    );

    expect(html).toContain('AI 控制平面');
    expect(html).toContain('CLI Runtime 注册表');
    expect(html).toContain('Runtime B SDK 端点');
    expect(html).toContain('Runtime 会话库接入');
    expect(html).toContain('不限于 Orbit 里启动过的任务');
    expect(html).toContain('PMIL 消化链路');
    expect(html).toContain('PMIL local agent strategy');
    expect(html).toContain('claude-3-5-sonnet-latest');
    expect(html).toContain('Implement runtime page');
    expect(html).toContain('claude local runtime');
  });

  it('renders a degraded runtime probe error separately from version', () => {
    const degradedSnapshot: DispatchSnapshot = {
      ...snapshot,
      runtimes: [
        {
          ...snapshot.runtimes[0]!,
          runtimeId: 'codex:/Users/example/.local/bin/codex',
          provider: 'codex',
          name: 'codex local runtime',
          binaryPath: '/Users/example/.local/bin/codex',
          version: null,
          status: 'degraded',
          metadata: {
            versionProbeError:
              'Version probe failed: missing executable referenced by CLI wrapper (ENOENT).'
          }
        }
      ],
      leases: [],
      reports: []
    };
    const html = renderToStaticMarkup(
      createElement(RuntimesWorkspaceSurface, {
        snapshot: degradedSnapshot,
        loading: false,
        projects: [],
        selectedRuntimeId: 'codex:/Users/example/.local/bin/codex',
        onRefresh: noop,
        onSelectRuntime: noop,
        onOpenProjectRoles: noop
      })
    );

    expect(html).toContain('版本：版本不可用');
    expect(html).toContain('探测问题');
    expect(html).toContain('missing executable referenced by CLI wrapper');
  });

  it('renders the role template library with versions and project bindings', () => {
    const html = renderToStaticMarkup(
      createElement(AgentsLibrarySurface, {
        snapshot,
        loading: false,
        projects: [{ uid: 'project-1', name: 'Moonshot' }],
        selectedTemplateId: 'role-template-executor',
        onRefresh: noop,
        onSelectTemplate: noop,
        onOpenProjectRoles: noop
      })
    );

    expect(html).toContain('角色模板');
    expect(html).toContain('模板基线');
    expect(html).toContain('项目绑定');
    expect(html).toContain('Moonshot');
  });

  it('renders the dedicated runtime sessions viewer shell', () => {
    const html = renderToStaticMarkup(createElement(RuntimeSessionsView));

    expect(html).toContain('AI 会话');
    expect(html).toContain('Claude Code');
    expect(html).toContain('Codex');
    expect(html).toContain('正在加载会话');
  });
});
