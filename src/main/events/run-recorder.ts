import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface RunRecordingPaths {
  raw: string;
  abstract: string;
  ui: string;
}

export class RunRecorder {
  private readonly active = new Map<string, RunRecordingPaths>();
  private readonly pending = new Map<string, Promise<RunRecordingPaths>>();

  constructor(private readonly baseDir: string) {}

  async startRecording(runId: string): Promise<RunRecordingPaths> {
    const active = this.active.get(runId);
    if (active) return active;
    const pending = this.pending.get(runId);
    if (pending) return pending;
    const started = this.createRecording(runId);
    this.pending.set(runId, started);
    try {
      return await started;
    } finally {
      this.pending.delete(runId);
    }
  }

  private async createRecording(runId: string): Promise<RunRecordingPaths> {
    const dir = path.join(this.baseDir, runId);
    await fs.mkdir(dir, { recursive: true });
    const paths: RunRecordingPaths = {
      raw: path.join(dir, 'raw-vendor.ndjson'),
      abstract: path.join(dir, 'abstract.ndjson'),
      ui: path.join(dir, 'ui-render.ndjson')
    };
    await Promise.all([
      fs.writeFile(paths.raw, '', 'utf8'),
      fs.writeFile(paths.abstract, '', 'utf8'),
      fs.writeFile(paths.ui, '', 'utf8')
    ]);
    this.active.set(runId, paths);
    return paths;
  }

  async recordRaw(runId: string, rawEvent: unknown): Promise<void> {
    await this.append(runId, 'raw', rawEvent);
  }

  async recordAbstract(runId: string, event: unknown): Promise<void> {
    await this.append(runId, 'abstract', event);
  }

  async recordUi(runId: string, event: unknown): Promise<void> {
    await this.append(runId, 'ui', event);
  }

  stopRecording(runId: string): void {
    this.active.delete(runId);
  }

  getRecordingPaths(runId: string): RunRecordingPaths | null {
    return this.active.get(runId) ?? null;
  }

  private async append(
    runId: string,
    layer: keyof RunRecordingPaths,
    event: unknown
  ): Promise<void> {
    const paths = this.active.get(runId);
    if (!paths) throw new Error(`run recorder is not active for ${runId}`);
    await fs.appendFile(paths[layer], `${JSON.stringify(event)}\n`, 'utf8');
  }
}
