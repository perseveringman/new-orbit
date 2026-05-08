import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ORBIT_DIR } from '@shared/constants';
import {
  EXTERNAL_GATEWAY_CAPABILITIES,
  type ExternalGatewayCapability
} from '@shared/external-gateway-protocol';
import type {
  ExternalGatewayAllowedUser,
  ExternalGatewayConfig,
  ExternalGatewayPushSubscription,
  ExternalGatewayRequestLogEntry,
  ExternalGatewaySessionMapping
} from '@shared/external-gateway';

const EXTERNAL_GATEWAY_DIR = 'external-gateway';

export class ExternalGatewayStore {
  constructor(private readonly vaultPath: string) {}

  dir(): string {
    return path.join(this.vaultPath, ORBIT_DIR, EXTERNAL_GATEWAY_DIR);
  }

  socketPath(): string {
    return path.join(this.vaultPath, ORBIT_DIR, 'external-gateway.sock');
  }

  async getConfig(): Promise<ExternalGatewayConfig> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.configPath(), 'utf8')) as Partial<ExternalGatewayConfig>;
      return normalizeConfig(parsed, this.vaultPath);
    } catch (error) {
      if (!isNotFound(error)) throw error;
      return defaultExternalGatewayConfig(this.vaultPath);
    }
  }

  async updateConfig(patch: Partial<ExternalGatewayConfig>): Promise<ExternalGatewayConfig> {
    const current = await this.getConfig();
    const next = normalizeConfig(
      {
        ...current,
        ...patch,
        capability_permissions: {
          ...current.capability_permissions,
          ...(patch.capability_permissions ?? {})
        },
        delegate: {
          ...current.delegate,
          ...(patch.delegate ?? {})
        },
        rate_limit: {
          ...current.rate_limit,
          ...(patch.rate_limit ?? {})
        },
        allowed_users: patch.allowed_users ?? current.allowed_users
      },
      this.vaultPath
    );
    await this.writeJson(this.configPath(), next);
    return next;
  }

  async listSessions(): Promise<ExternalGatewaySessionMapping[]> {
    return (await this.readJson<SessionMapFile>(this.sessionMapPath(), { version: 1, sessions: [] })).sessions
      .slice()
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  }

  async getSession(sessionId: string): Promise<ExternalGatewaySessionMapping | null> {
    return (await this.listSessions()).find((item) => item.sessionId === sessionId) ?? null;
  }

  async upsertSession(input: {
    sessionId: string;
    conversationId: string;
    platform: string;
    userId: string;
    userName?: string;
  }): Promise<ExternalGatewaySessionMapping> {
    const file = await this.readJson<SessionMapFile>(this.sessionMapPath(), { version: 1, sessions: [] });
    const now = new Date().toISOString();
    const existing = file.sessions.find((item) => item.sessionId === input.sessionId);
    if (existing) {
      existing.conversationId = input.conversationId;
      existing.platform = input.platform;
      existing.userId = input.userId;
      if (input.userName) existing.userName = input.userName;
      existing.lastActivityAt = now;
      existing.archived = false;
      await this.writeJson(this.sessionMapPath(), file);
      return existing;
    }
    const next: ExternalGatewaySessionMapping = {
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      platform: input.platform,
      userId: input.userId,
      ...(input.userName ? { userName: input.userName } : {}),
      createdAt: now,
      lastActivityAt: now,
      archived: false
    };
    file.sessions.push(next);
    await this.writeJson(this.sessionMapPath(), file);
    return next;
  }

  async archiveSession(sessionId: string): Promise<ExternalGatewaySessionMapping | null> {
    const file = await this.readJson<SessionMapFile>(this.sessionMapPath(), { version: 1, sessions: [] });
    const existing = file.sessions.find((item) => item.sessionId === sessionId);
    if (!existing) return null;
    existing.archived = true;
    existing.lastActivityAt = new Date().toISOString();
    await this.writeJson(this.sessionMapPath(), file);
    return existing;
  }

  async listSubscriptions(): Promise<ExternalGatewayPushSubscription[]> {
    return (await this.readJson<SubscriptionFile>(this.subscriptionsPath(), { version: 1, subscriptions: [] })).subscriptions;
  }

  async upsertSubscription(
    input: Omit<ExternalGatewayPushSubscription, 'id' | 'createdAt'> & Partial<Pick<ExternalGatewayPushSubscription, 'id' | 'createdAt'>>
  ): Promise<ExternalGatewayPushSubscription> {
    const file = await this.readJson<SubscriptionFile>(this.subscriptionsPath(), { version: 1, subscriptions: [] });
    const existing = input.id ? file.subscriptions.find((item) => item.id === input.id) : undefined;
    const next: ExternalGatewayPushSubscription = {
      id: input.id ?? `push-${randomUUID()}`,
      kind: input.kind,
      target: input.target,
      enabled: input.enabled,
      ...(input.schedule ? { schedule: input.schedule } : {}),
      createdAt: input.createdAt ?? existing?.createdAt ?? new Date().toISOString()
    };
    if (existing) file.subscriptions = file.subscriptions.map((item) => (item.id === next.id ? next : item));
    else file.subscriptions.push(next);
    await this.writeJson(this.subscriptionsPath(), file);
    return next;
  }

  async recordRequest(entry: ExternalGatewayRequestLogEntry): Promise<void> {
    await fs.mkdir(this.dir(), { recursive: true });
    await fs.appendFile(this.requestLogPath(), `${JSON.stringify(entry)}\n`, 'utf8');
  }

  async listRequestLog(limit = 100): Promise<ExternalGatewayRequestLogEntry[]> {
    try {
      return (await fs.readFile(this.requestLogPath(), 'utf8'))
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ExternalGatewayRequestLogEntry)
        .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
        .slice(0, limit);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  async messagesToday(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    return (await this.listRequestLog(10_000)).filter((entry) => entry.receivedAt.startsWith(today)).length;
  }

  isAllowed(config: ExternalGatewayConfig, user: ExternalGatewayAllowedUser): boolean {
    if (!config.require_allowed_user) return true;
    return config.allowed_users.some((item) => item.platform === user.platform && item.userId === user.userId);
  }

  private configPath(): string {
    return path.join(this.dir(), 'config.json');
  }

  private sessionMapPath(): string {
    return path.join(this.dir(), 'session-map.json');
  }

  private subscriptionsPath(): string {
    return path.join(this.dir(), 'push-subscriptions.json');
  }

  private requestLogPath(): string {
    return path.join(this.dir(), 'request-log.ndjson');
  }

  private async readJson<T>(filePath: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
    } catch (error) {
      if (isNotFound(error)) return fallback;
      throw error;
    }
  }

  private async writeJson(filePath: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
}

interface SessionMapFile {
  version: 1;
  sessions: ExternalGatewaySessionMapping[];
}

interface SubscriptionFile {
  version: 1;
  subscriptions: ExternalGatewayPushSubscription[];
}

export function createExternalGatewayStore(vaultPath: string): ExternalGatewayStore {
  return new ExternalGatewayStore(vaultPath);
}

export function defaultExternalGatewayConfig(vaultPath: string): ExternalGatewayConfig {
  const permissions = Object.fromEntries(
    EXTERNAL_GATEWAY_CAPABILITIES.map((capability) => [capability, capability !== 'delegate.coding_agent'])
  ) as Record<ExternalGatewayCapability, boolean>;
  return {
    version: 1,
    enabled: false,
    socket_path: path.join(vaultPath, ORBIT_DIR, 'external-gateway.sock'),
    require_allowed_user: false,
    allowed_users: [],
    capability_permissions: permissions,
    delegate: {
      enabled: false,
      target_agent: 'claudecode'
    },
    rate_limit: {
      requests_per_minute: 10
    },
    request_log_retention_days: 30
  };
}

function normalizeConfig(input: Partial<ExternalGatewayConfig>, vaultPath: string): ExternalGatewayConfig {
  const defaults = defaultExternalGatewayConfig(vaultPath);
  const permissions = { ...defaults.capability_permissions, ...(input.capability_permissions ?? {}) };
  return {
    version: 1,
    enabled: Boolean(input.enabled),
    socket_path: typeof input.socket_path === 'string' && input.socket_path.trim() ? input.socket_path : defaults.socket_path,
    require_allowed_user: Boolean(input.require_allowed_user),
    allowed_users: Array.isArray(input.allowed_users)
      ? input.allowed_users
          .filter((item) => item && typeof item.platform === 'string' && typeof item.userId === 'string')
          .map((item) => ({
            platform: item.platform,
            userId: item.userId,
            ...(item.name ? { name: item.name } : {})
          }))
      : [],
    capability_permissions: permissions,
    delegate: {
      enabled: Boolean(input.delegate?.enabled),
      target_agent: input.delegate?.target_agent?.trim() || defaults.delegate.target_agent
    },
    rate_limit: {
      requests_per_minute: Math.max(1, Math.floor(input.rate_limit?.requests_per_minute ?? defaults.rate_limit.requests_per_minute))
    },
    request_log_retention_days: Math.max(1, Math.floor(input.request_log_retention_days ?? defaults.request_log_retention_days))
  };
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'ENOENT');
}

