export interface TerminalGrid {
  cols: number;
  rows: number;
}

export interface FitLike {
  fit(): void;
}

export interface TerminalLike {
  cols: number;
  rows: number;
}

export interface HostLike {
  clientWidth: number;
  clientHeight: number;
}

interface SyncTerminalSizeArgs {
  fit: FitLike;
  term: TerminalLike;
  sessionId?: string | null;
  resize(sessionId: string, cols: number, rows: number): void | Promise<void>;
  host?: HostLike | null;
  previousGrid?: TerminalGrid | null;
}

export function syncTerminalSize({
  fit,
  term,
  sessionId,
  resize,
  host,
  previousGrid
}: SyncTerminalSizeArgs): TerminalGrid | null {
  if (host && (host.clientWidth <= 0 || host.clientHeight <= 0)) {
    return null;
  }

  try {
    fit.fit();
  } catch {
    return null;
  }

  const grid = { cols: term.cols, rows: term.rows };
  const changed =
    !previousGrid ||
    previousGrid.cols !== grid.cols ||
    previousGrid.rows !== grid.rows;
  if (sessionId && changed) {
    void resize(sessionId, grid.cols, grid.rows);
  }
  return grid;
}
