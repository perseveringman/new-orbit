import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import {
  authorityRuleIsExpired,
  autopilotSessionIsExpired,
  type AuthorityRule,
  type AutopilotSession
} from '@shared/authority';

interface AuthorityGrantFile {
  version: 1;
  updatedAt: string;
  rules: AuthorityRule[];
  autopilotSessions: AutopilotSession[];
}

export class AuthorityGrantStore {
  constructor(private readonly vaultPath: string) {}

  async listRules(): Promise<AuthorityRule[]> {
    return (await this.read()).rules;
  }

  async listAutopilotSessions(): Promise<AutopilotSession[]> {
    return (await this.read()).autopilotSessions;
  }

  async upsertRule(input: Omit<AuthorityRule, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<AuthorityRule> {
    const file = await this.read();
    const now = new Date().toISOString();
    const { id: inputId, ...rest } = input;
    const existing = inputId ? file.rules.find((rule) => rule.id === inputId) : undefined;
    const rule: AuthorityRule = {
      ...(existing ?? { id: inputId ?? `grant-${randomUUID()}`, createdAt: now }),
      ...rest,
      updatedAt: now
    };
    await this.write({
      ...file,
      rules: [rule, ...file.rules.filter((item) => item.id !== rule.id)]
    });
    return rule;
  }

  async deleteRule(id: string): Promise<void> {
    const file = await this.read();
    await this.write({
      ...file,
      rules: file.rules.filter((rule) => rule.id !== id)
    });
  }

  async upsertAutopilotSession(
    input: Omit<AutopilotSession, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<AutopilotSession> {
    const file = await this.read();
    const now = new Date().toISOString();
    const { id: inputId, ...rest } = input;
    const existing = inputId
      ? file.autopilotSessions.find((session) => session.id === inputId)
      : undefined;
    const session: AutopilotSession = {
      ...(existing ?? { id: inputId ?? `autopilot-${randomUUID()}`, createdAt: now }),
      ...rest,
      updatedAt: now
    };
    await this.write({
      ...file,
      autopilotSessions: [
        session,
        ...file.autopilotSessions.filter((item) => item.id !== session.id)
      ]
    });
    return session;
  }

  async stopAutopilotSession(id: string): Promise<void> {
    const file = await this.read();
    const now = new Date().toISOString();
    await this.write({
      ...file,
      autopilotSessions: file.autopilotSessions.map((session) =>
        session.id === id ? { ...session, enabled: false, updatedAt: now } : session
      )
    });
  }

  async pruneExpired(now = Date.now()): Promise<void> {
    const file = await this.read();
    await this.write({
      ...file,
      rules: file.rules.filter((rule) => !authorityRuleIsExpired(rule, now)),
      autopilotSessions: file.autopilotSessions.filter(
        (session) => !autopilotSessionIsExpired(session, now)
      )
    });
  }

  private filePath(): string {
    return path.join(this.vaultPath, ORBIT_DIR, 'authority', 'grants.json');
  }

  private async read(): Promise<AuthorityGrantFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath(), 'utf8')) as Partial<AuthorityGrantFile>;
      return {
        version: 1,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        rules: Array.isArray(parsed.rules) ? (parsed.rules as AuthorityRule[]) : [],
        autopilotSessions: Array.isArray(parsed.autopilotSessions)
          ? (parsed.autopilotSessions as AutopilotSession[])
          : []
      };
    } catch (error) {
      if (isNotFound(error)) {
        return { version: 1, updatedAt: new Date().toISOString(), rules: [], autopilotSessions: [] };
      }
      throw error;
    }
  }

  private async write(file: Omit<AuthorityGrantFile, 'version' | 'updatedAt'>): Promise<void> {
    const target = this.filePath();
    const next: AuthorityGrantFile = {
      version: 1,
      updatedAt: new Date().toISOString(),
      rules: file.rules,
      autopilotSessions: file.autopilotSessions
    };
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
}

export function createAuthorityGrantStore(vaultPath: string): AuthorityGrantStore {
  return new AuthorityGrantStore(vaultPath);
}

function isNotFound(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'ENOENT'
  );
}
