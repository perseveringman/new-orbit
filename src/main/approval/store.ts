import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  ProposalSchema,
  type Proposal,
  type ProposalListFilter,
  type ProposalStatus,
  type ProposalType
} from './types';

export class ApprovalStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(readonly vaultPath: string) {}

  approvalDir(): string {
    return path.join(this.vaultPath, '.orbit', 'approvals');
  }

  pendingPath(): string {
    return path.join(this.approvalDir(), 'pending.ndjson');
  }

  archiveDir(): string {
    return path.join(this.approvalDir(), 'archive');
  }

  archivePathForIso(iso: string): string {
    return path.join(this.archiveDir(), `${monthKeyFromIso(iso)}.ndjson`);
  }

  async submit(proposal: Proposal): Promise<Proposal> {
    return this.withWriteLock(async () => {
      const existing = await this.getUnlocked(proposal.id);
      if (existing) throw new Error(`proposal already exists: ${proposal.id}`);
      const parsed = ProposalSchema.parse(proposal);
      if (parsed.status !== 'pending') {
        throw new Error(`cannot submit proposal ${parsed.id} with status ${parsed.status}`);
      }
      await fs.mkdir(this.approvalDir(), { recursive: true });
      await fs.appendFile(this.pendingPath(), `${JSON.stringify(parsed)}\n`, 'utf8');
      return parsed;
    });
  }

  async resolve(
    id: string,
    resolver: (proposal: Proposal) => Promise<Proposal> | Proposal
  ): Promise<Proposal> {
    return this.withWriteLock(async () => {
      const pending = await this.readPendingUnlocked();
      const index = pending.findIndex((proposal) => proposal.id === id);
      if (index < 0) {
        const archived = await this.getArchivedUnlocked(id);
        if (archived) {
          throw new Error(`cannot resolve proposal ${id}: already ${archived.status}`);
        }
        throw new Error(`proposal not found: ${id}`);
      }
      const current = pending[index]!;
      const next = ProposalSchema.parse(await resolver(current));
      if (next.id !== current.id) {
        throw new Error(`proposal resolver changed id: ${current.id} -> ${next.id}`);
      }
      if (next.status === 'pending') {
        throw new Error(`invalid proposal transition: pending -> pending`);
      }
      pending.splice(index, 1);
      await this.appendArchiveUnlocked(next);
      await this.writePendingUnlocked(pending);
      return next;
    });
  }

  async list(filter: ProposalListFilter = {}): Promise<Proposal[]> {
    const pending = await this.readPendingUnlocked();
    const archived = filter.includeArchived === false ? [] : await this.readArchivesUnlocked();
    return [...pending, ...archived].filter((proposal) => matchesFilter(proposal, filter));
  }

  async get(id: string): Promise<Proposal | null> {
    return this.getUnlocked(id);
  }

  private async getUnlocked(id: string): Promise<Proposal | null> {
    const pending = await this.readPendingUnlocked();
    const match = pending.find((proposal) => proposal.id === id);
    if (match) return match;
    return this.getArchivedUnlocked(id);
  }

  private async getArchivedUnlocked(id: string): Promise<Proposal | null> {
    const archived = await this.readArchivesUnlocked();
    return archived.find((proposal) => proposal.id === id) ?? null;
  }

  private async readPendingUnlocked(): Promise<Proposal[]> {
    return readProposalNdjson(this.pendingPath());
  }

  private async readArchivesUnlocked(): Promise<Proposal[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.archiveDir());
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const files = entries
      .filter((entry) => /^\d{4}-\d{2}\.ndjson$/.test(entry))
      .sort()
      .map((entry) => path.join(this.archiveDir(), entry));
    const chunks = await Promise.all(files.map((file) => readProposalNdjson(file)));
    return chunks.flat();
  }

  private async appendArchiveUnlocked(proposal: Proposal): Promise<void> {
    const resolvedAt = proposal.resolved_at ?? proposal.submitted_at;
    const archivePath = this.archivePathForIso(resolvedAt);
    await fs.mkdir(path.dirname(archivePath), { recursive: true });
    await fs.appendFile(archivePath, `${JSON.stringify(proposal)}\n`, 'utf8');
  }

  private async writePendingUnlocked(proposals: Proposal[]): Promise<void> {
    await fs.mkdir(this.approvalDir(), { recursive: true });
    const content = proposals.map((proposal) => JSON.stringify(proposal)).join('\n');
    await fs.writeFile(this.pendingPath(), content ? `${content}\n` : '', 'utf8');
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.catch(() => undefined).then(operation);
    this.writeQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

export function createApprovalStore(vaultPath: string): ApprovalStore {
  return new ApprovalStore(vaultPath);
}

export async function readProposalNdjson(filePath: string): Promise<Proposal[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const proposals: Proposal[] = [];
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    try {
      proposals.push(ProposalSchema.parse(JSON.parse(line)));
    } catch (error) {
      const lineNumber = index + 1;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid proposal record in ${filePath}:${lineNumber}: ${message}`);
    }
  }
  return proposals;
}

export function monthKeyFromIso(value: string): string {
  const key = value.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(key) || Number.isNaN(Date.parse(value))) {
    throw new Error(`invalid proposal timestamp: ${value}`);
  }
  return key;
}

function matchesFilter(
  proposal: Proposal,
  filter: { status?: ProposalStatus; type?: ProposalType }
): boolean {
  if (filter.status && proposal.status !== filter.status) return false;
  if (filter.type && proposal.type !== filter.type) return false;
  return true;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
