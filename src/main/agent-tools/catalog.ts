import type {
  AgentToolDef,
  AgentToolRegistrySnapshot,
  AgentToolRegistrationView
} from '@shared/agent-tools';
import { OPENCLAW_PARITY_PLANNED_TOOL_VIEWS, PHASE_C_TOOL_DEFS } from './definitions';

const OPENCLAW_REFERENCE_CAPABILITIES = [
  'nodes',
  'cron',
  'heartbeat',
  'message',
  'tts',
  'image',
  'image_generate',
  'music_generate',
  'video_generate',
  'gateway',
  'agents_list',
  'update_plan',
  'sessions_list',
  'sessions_history',
  'sessions_send',
  'sessions_spawn',
  'subagents',
  'session_status',
  'web_search',
  'web_fetch',
  'pdf',
  'plugin tools'
] as const;

export function buildAgentToolRegistrySnapshot(
  activeDefs: readonly AgentToolDef[] = PHASE_C_TOOL_DEFS
): AgentToolRegistrySnapshot {
  const active = activeDefs.map(definitionToView).sort(sortToolView);
  const planned = [...OPENCLAW_PARITY_PLANNED_TOOL_VIEWS].sort(sortToolView);
  const implementedCaps = collectEquivalentCapabilities(active);
  const plannedCaps = collectEquivalentCapabilities(planned);
  const missing = OPENCLAW_REFERENCE_CAPABILITIES.filter(
    (capability) => !implementedCaps.includes(capability) && !plannedCaps.includes(capability)
  );
  return {
    generatedAt: Date.now(),
    totalActive: active.length,
    totalPlanned: planned.length,
    active,
    planned,
    openClawParity: {
      implemented: implementedCaps,
      planned: plannedCaps.filter((capability) => !implementedCaps.includes(capability)),
      missing
    }
  };
}

function definitionToView(def: AgentToolDef): AgentToolRegistrationView {
  return {
    name: def.name,
    description: def.description,
    cliMethod: def.cliMethod,
    family: def.family ?? 'orbit',
    risk: def.risk ?? (def.destructive ? 'L2_reversible_draft' : 'L0_observe'),
    permissions: def.permissions ?? (def.destructive ? ['write_vault_direct'] : ['read']),
    scopes: def.scopes ?? [],
    status: def.status ?? 'active',
    source: def.source ?? 'orbit',
    destructive: def.destructive,
    timeoutMs: def.timeoutMs,
    openClawEquivalent: def.openClawEquivalent
  };
}

function collectEquivalentCapabilities(views: readonly AgentToolRegistrationView[]): string[] {
  const out = new Set<string>();
  for (const view of views) {
    for (const capability of OPENCLAW_REFERENCE_CAPABILITIES) {
      if (view.openClawEquivalent?.includes(capability)) out.add(capability);
    }
  }
  if (views.some((view) => view.family === 'shell' && view.status === 'active')) out.add('nodes');
  if (views.some((view) => view.name === 'orbit_subagent_spawn' && view.status === 'active')) {
    out.add('sessions_spawn');
    out.add('subagents');
  }
  if (views.some((view) => view.name === 'orbit_subagent_list' && view.status === 'active')) {
    out.add('sessions_list');
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function sortToolView(a: AgentToolRegistrationView, b: AgentToolRegistrationView): number {
  return a.family.localeCompare(b.family) || a.name.localeCompare(b.name);
}
