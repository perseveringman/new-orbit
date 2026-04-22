import { describe, it, expect } from 'vitest';
import {
  appendToSection,
  parseTaskSections,
  serializeTaskSections,
  setSection
} from '../src/main/task_sections';

const full = [
  '# Description',
  'Ship the TaskEditor.',
  '',
  '# Agent Thinking',
  'think...',
  '',
  '# Execution Log',
  '- [2025-01-01T00:00:00Z] kick-off',
  '',
  '# Summary',
  'done.',
  ''
].join('\n');

describe('task_sections', () => {
  it('parses the canonical four-section body', () => {
    const s = parseTaskSections(full);
    expect(s.description).toBe('Ship the TaskEditor.');
    expect(s.thinking).toBe('think...');
    expect(s.executionLog).toBe('- [2025-01-01T00:00:00Z] kick-off');
    expect(s.summary).toBe('done.');
    expect(s.other).toBe('');
  });

  it('survives round-trip parse → serialize', () => {
    const s = parseTaskSections(full);
    const out = serializeTaskSections(s);
    // Whitespace normalization may differ by one trailing newline but a
    // second round trip must be a true fixed point.
    const s2 = parseTaskSections(out);
    expect(s2).toEqual(s);
  });

  it('treats missing sections as empty strings', () => {
    const s = parseTaskSections('# Description\nhello\n');
    expect(s.description).toBe('hello');
    expect(s.thinking).toBe('');
    expect(s.executionLog).toBe('');
    expect(s.summary).toBe('');
  });

  it('serializes with stable order and skips empty sections', () => {
    const out = serializeTaskSections({
      description: 'D',
      thinking: '',
      executionLog: 'L',
      summary: '',
      other: ''
    });
    expect(out).toContain('# Description');
    expect(out).toContain('# Execution Log');
    expect(out).not.toContain('# Agent Thinking');
    expect(out).not.toContain('# Summary');
    expect(out.indexOf('# Description')).toBeLessThan(out.indexOf('# Execution Log'));
  });

  it('preserves non-canonical user sections in `other`', () => {
    const src = [
      '# Description',
      'd',
      '',
      '# Notes',
      'freeform',
      'more notes',
      '',
      '# Summary',
      's'
    ].join('\n');
    const s = parseTaskSections(src);
    expect(s.description).toBe('d');
    expect(s.summary).toBe('s');
    expect(s.other).toContain('# Notes');
    expect(s.other).toContain('freeform');
    // Round trip keeps the user section.
    const out = serializeTaskSections(s);
    expect(out).toContain('# Notes');
    expect(out).toContain('more notes');
  });

  it('appendToSection appends to existing and creates when missing', () => {
    const b1 = appendToSection(full, 'executionLog', '- [2025-01-02] step 2');
    const s1 = parseTaskSections(b1);
    expect(s1.executionLog).toContain('kick-off');
    expect(s1.executionLog).toContain('step 2');
    // Missing section materialized on append.
    const b2 = appendToSection('# Description\nd\n', 'summary', 'wrap');
    const s2 = parseTaskSections(b2);
    expect(s2.summary).toBe('wrap');
    expect(s2.description).toBe('d');
  });

  it('setSection replaces only the targeted section', () => {
    const out = setSection(full, 'summary', 'reshipped');
    const s = parseTaskSections(out);
    expect(s.summary).toBe('reshipped');
    expect(s.description).toBe('Ship the TaskEditor.');
    expect(s.thinking).toBe('think...');
    expect(s.executionLog).toContain('kick-off');
  });
});
