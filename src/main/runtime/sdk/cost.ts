import type { SDKCostEstimate, SDKCostEstimateInput, SDKCostProfile } from '@shared/runtime';

export const DEFAULT_SDK_COST_PROFILE: SDKCostProfile = {
  inputPerMTok: 3,
  outputPerMTok: 15
};

export function estimateSdkCost(input: SDKCostEstimateInput): SDKCostEstimate {
  const inputTokens = Math.max(0, Math.round(input.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.round(input.outputTokens ?? 0));
  const cacheReadTokens = Math.max(0, Math.round(input.cacheReadTokens ?? 0));
  const cacheWriteTokens = Math.max(0, Math.round(input.cacheWriteTokens ?? 0));
  const profile = input.profile;
  const totalUsd = profile
    ? (inputTokens / 1_000_000) * profile.inputPerMTok +
      (outputTokens / 1_000_000) * profile.outputPerMTok +
      (cacheReadTokens / 1_000_000) * (profile.cacheReadPerMTok ?? 0) +
      (cacheWriteTokens / 1_000_000) * (profile.cacheWritePerMTok ?? profile.inputPerMTok)
    : undefined;
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    ...(totalUsd !== undefined ? { totalUsd } : {})
  };
}

export function roughTokenEstimate(text: string): number {
  return Math.ceil(text.length / 4);
}

