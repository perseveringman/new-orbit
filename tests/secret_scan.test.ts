import { describe, expect, it } from 'vitest';
import { scanDiff } from '../src/main/git/checks';

function diff(file: string, lines: string[]): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((l) => `+${l}`)
  ].join('\n');
}

describe('scanDiff', () => {
  it('catches each rule on a positive sample', () => {
    const cases: Array<{ rule: string; line: string }> = [
      { rule: 'aws_access_key', line: 'const k = "AKIA' + 'ABCDEFGHIJKLMNOP' + '"' },
      { rule: 'aws_secret', line: 'aws_secret_key=abcd1234veryreallylongvalue' },
      { rule: 'github_token', line: 'token=ghp_abcdefghijklmnopqrstuvwxyz' },
      { rule: 'slack_token', line: 'xoxb-12345678901-abcdefghij' },
      { rule: 'private_key', line: '-----BEGIN RSA PRIVATE KEY-----' },
      { rule: 'anthropic_api_key', line: 'ANTHROPIC_API_KEY=sk-ant-abcdefghijklmnopqrstuvwxyz' },
      { rule: 'openai_api_key', line: 'OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"' },
      { rule: 'google_api_key', line: 'GOOGLE_API_KEY=abcdefghijklmnopqrstuvwxyz' }
    ];
    for (const c of cases) {
      const d = diff('secrets.env', [c.line]);
      const findings = scanDiff(d);
      expect(findings.some((f) => f.rule === c.rule), `rule ${c.rule} missed`).toBe(true);
    }
  });

  it('ignores benign-looking lookalikes', () => {
    const d = diff('README.md', [
      '// ANTHROPIC_API_KEY= (set via env)',
      '# example aws: set AWS_ACCESS_KEY_ID like AKIAEXAMPLE (too short)',
      'GitHub token format is ghp_<redacted>'
    ]);
    const findings = scanDiff(d);
    expect(findings).toEqual([]);
  });

  it('does not flag context lines (no leading +)', () => {
    const d = [
      `diff --git a/f b/f`,
      `--- a/f`,
      `+++ b/f`,
      `@@ -1,1 +1,1 @@`,
      ` AKIAABCDEFGHIJKLMNOP`
    ].join('\n');
    expect(scanDiff(d)).toEqual([]);
  });
});
