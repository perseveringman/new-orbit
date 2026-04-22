import { describe, it, expect } from 'vitest';
import { mapEventType } from '../src/main/agent/hooks/mapEventType';

describe('mapEventType', () => {
  it('maps claude Stop', () => {
    expect(mapEventType('claude', { hook_event_name: 'Stop' })).toBe('Stop');
  });
  it('maps claude PreToolUse to PermissionRequest', () => {
    expect(mapEventType('claude', { hook_event_name: 'PreToolUse' })).toBe('PermissionRequest');
  });
  it('maps claude Notification to Progress', () => {
    expect(mapEventType('claude', { hook_event_name: 'Notification' })).toBe('Progress');
  });
  it('maps codex exec_approval_request to PermissionRequest', () => {
    expect(mapEventType('codex', { type: 'exec_approval_request' })).toBe('PermissionRequest');
  });
  it('maps generic start', () => {
    expect(mapEventType(undefined, { type: 'start' })).toBe('Start');
  });
  it('maps generic stop/done/end', () => {
    expect(mapEventType(undefined, { type: 'stop' })).toBe('Stop');
    expect(mapEventType(undefined, { type: 'done' })).toBe('Stop');
    expect(mapEventType('whatever', { type: 'end' })).toBe('Stop');
  });
  it('maps generic progress', () => {
    expect(mapEventType(undefined, { type: 'progress' })).toBe('Progress');
  });
  it('defaults unknown to Progress', () => {
    expect(mapEventType('claude', { hook_event_name: 'Unknown' })).toBe('Progress');
    expect(mapEventType(undefined, {})).toBe('Progress');
  });
});
