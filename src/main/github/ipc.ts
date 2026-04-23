import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  CreateGitHubPullRequestArgsDTO,
  GitHubRepositoryListArgsDTO,
  GitHubTaskIssueBindingArgsDTO,
  ImportGitHubRepositoryArgsDTO,
  ImportGitHubRepositoryResultDTO,
  PublishProjectToGitHubArgsDTO
} from '@shared/ipc';
import type {
  GitHubConnection,
  GitHubProjectDetails,
  GitHubProjectState,
  GitHubPullRequestSummary,
  GitHubTaskBinding,
  GitHubWorkspaceRepository
} from '@shared/github';
import { currentSession } from '../fs';
import {
  authenticateGitHub,
  createGitHubPullRequest,
  bindTaskToGitHubIssue,
  getGitHubConnection,
  getGitHubProjectDetails,
  getGitHubProjectState,
  importGitHubRepository,
  listGitHubRepositories,
  publishProjectToGitHub,
  unbindTaskFromGitHubIssue
} from './service';

let wired = false;

export function registerGitHubIpc(): void {
  if (wired) return;
  wired = true;

  ipcMain.handle(IPC.github.getConnection, async (): Promise<GitHubConnection> => {
    return getGitHubConnection();
  });

  ipcMain.handle(IPC.github.authenticate, async (): Promise<GitHubConnection> => {
    return authenticateGitHub();
  });

  ipcMain.handle(
    IPC.github.listRepositories,
    async (_e, args?: GitHubRepositoryListArgsDTO): Promise<GitHubWorkspaceRepository[]> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      return listGitHubRepositories(sess.vault, args ?? {});
    }
  );

  ipcMain.handle(
    IPC.github.getProjectState,
    async (_e, projectUid: string): Promise<GitHubProjectState> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      return getGitHubProjectState(sess.vault, projectUid);
    }
  );

  ipcMain.handle(
    IPC.github.getProjectDetails,
    async (_e, projectUid: string): Promise<GitHubProjectDetails> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      return getGitHubProjectDetails(sess.vault, projectUid);
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

  ipcMain.handle(
    IPC.github.bindTaskIssue,
    async (_e, args: GitHubTaskIssueBindingArgsDTO): Promise<GitHubTaskBinding> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      return bindTaskToGitHubIssue(sess.vault, args.taskPath, args);
    }
  );

  ipcMain.handle(
    IPC.github.unbindTaskIssue,
    async (_e, taskPath: string): Promise<void> => {
      const sess = currentSession();
      if (!sess) throw new Error('no vault');
      return unbindTaskFromGitHubIssue(sess.vault, taskPath);
    }
  );
}
