import { describe, expect, it } from 'vitest';
import { createUnifiedAgentEvent } from '../src/shared/agent-event';
import {
  buildContinuationPrompt,
  estimateTranscriptTokens,
  summarizeUnifiedTranscript
} from '../src/main/orchestration/switch_runtime';

describe('switch runtime continuation helpers', () => {
  it('estimates transcript tokens from text length', () => {
    const events = [
      createUnifiedAgentEvent('message', {
        runId: 'run_1',
        runtime: { provider: 'claude' }
      }, { text: 'a'.repeat(100) })
    ];

    expect(estimateTranscriptTokens(events)).toBe(30);
  });

  it('builds the required continuation prompt shape', () => {
    const prompt = buildContinuationPrompt({
      task: { uid: 'task_1', title: 'Implement feature' },
      previousRuntime: 'Claude',
      previousSessionId: 'session-1234567890',
      injectedText: 'assistant: already changed files',
      strategy: 'full'
    });

    expect(prompt).toContain('# 接手协议');
    expect(prompt).toContain('orbit task transcript task_1');
    expect(prompt).toContain('> 接手分析：');
    expect(prompt).toContain('注入策略：full');
  });

  it('summarizes transcript with head and tail events', () => {
    const events = Array.from({ length: 24 }, (_, index) =>
      createUnifiedAgentEvent('message', {
        runId: 'run_1',
        runtime: { provider: 'claude' }
      }, { text: `message-${index}` })
    );

    expect(summarizeUnifiedTranscript(events)).toContain('message-0');
    expect(summarizeUnifiedTranscript(events)).toContain('message-23');
  });
});
