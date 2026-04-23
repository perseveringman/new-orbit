import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  CreateGitHubPullRequestArgsDTO,
  ImportGitHubRepositoryArgsDTO,
  ImportGitHubRepositoryResultDTO,
  PublishProjectToGitHubArgsDTO
} from '@shared/ipc';
import type {
  GitHubConnection,
  GitHubProjectState,
  GitHubPullRequestSummary
} from '@shared/github';
import { currentSession } from '../fs';
import {
  createGitHubPullRequest,
  getGitHubConnection,
  getGitHubProjectState,
  importGitHubRepository,
  publishProjectToGitHub
} from './service';

let wired = false;

export function registerGitHubIpc(): void {
  if (wired) return;
  wired = true;

  ipcMain.handle(IPC.github.getConnection, async (): Promise<GitHubConnection> => {
    return getGitHubConnection();
  });

  ipcMain.handle(
    IPC.github.getProjectState,
    async (_e, projectUid: string): Promise<GitHubProjectState> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      return getGitHubProjectState(sess.vault, projectUid);
    }
  );

  ipcMain.handle(
    IPC.github.publishProject,
    async (_e, args: PublishProjectToGitHubArgsDTO): Promise<GitHubProjectState> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      return publishProjectToGitHub(sess.vault, args);
    }
  );

  ipcMain.handle(
    IPC.github.importRepository,
    async (_e, args: ImportGitHubRepositoryArgsDTO): Promise<ImportGitHubRepositoryResultDTO> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      return importGitHubRepository(sess.vault, args);
    }
  );

  ipcMain.handle(
    IPC.github.createPullRequest,
    async (_e, args: CreateGitHubPullRequestArgsDTO): Promise<GitHubPullRequestSummary> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      return createGitHubPullRequest(sess.vault, args);
    }
  );
}
