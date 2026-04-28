export type RuntimeRouteMode = 'task' | 'ask' | 'synthesis' | 'background';

export type RuntimeRouteTrack = 'cli' | 'sdk';

export interface RuntimeRouteInput {
  mode: RuntimeRouteMode;
  endpointHint?: string;
  modelHint?: string;
  budgetHintUsd?: number;
  requiresTools?: boolean;
}

export interface RuntimeRouteDecision {
  mode: RuntimeRouteMode;
  track: RuntimeRouteTrack;
  runtime: string;
  endpointId?: string;
  model?: string;
  reason: string;
  fallback?: RuntimeRouteDecision;
}

export function defaultTrackForMode(mode: RuntimeRouteMode): RuntimeRouteTrack {
  return mode === 'task' ? 'cli' : 'sdk';
}

