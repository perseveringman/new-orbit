import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DispatchSnapshot } from '../src/shared/orchestration';
import type { SDKEndpointRegistrySnapshot } from '../src/shared/runtime';
import { AgentsLibrarySurface } from '../src/renderer/src/views/AgentsLibraryView';
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
        loading: false,
        projects: [{ uid: 'project-1', name: 'Moonshot' }],
        selectedRuntimeId: 'claude:/usr/local/bin/claude',
        onRefresh: noop,
        onSelectRuntime: noop,
        onOpenProjectRoles: noop
      })
    );

    expect(html).toContain('AI Control Plane');
    expect(html).toContain('Runtime Registry');
    expect(html).toContain('Runtime B SDK Endpoints');
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

    expect(html).toContain('Version: version unavailable');
    expect(html).toContain('Probe issue');
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

    expect(html).toContain('Role Templates');
    expect(html).toContain('Template Baseline');
    expect(html).toContain('Project Bindings');
    expect(html).toContain('Moonshot');
  });
});
