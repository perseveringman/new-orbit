import { describe, it, expect } from 'vitest';
import { mapEventType, mapTerminalEventType } from '../src/main/agent/hooks/mapEventType';

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

describe('mapTerminalEventType', () => {
  it('maps terminal start-family hook names', () => {
    expect(mapTerminalEventType('UserPromptSubmit')).toBe('Start');
    expect(mapTerminalEventType('SessionStart')).toBe('Start');
    expect(mapTerminalEventType('PostToolUse')).toBe('Start');
  });

  it('maps terminal permission hook names', () => {
    expect(mapTerminalEventType('PermissionRequest')).toBe('PermissionRequest');
    expect(mapTerminalEventType('PreToolUse')).toBe('PermissionRequest');
    expect(mapTerminalEventType('exec_approval_request')).toBe('PermissionRequest');
  });

  it('maps terminal stop-family hook names and ignores unknown names', () => {
    expect(mapTerminalEventType('Stop')).toBe('Stop');
    expect(mapTerminalEventType('session_end')).toBe('Stop');
    expect(mapTerminalEventType('unknown')).toBeNull();
  });
});
