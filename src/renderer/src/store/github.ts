import { create } from 'zustand';
import type { GitHubConnection, GitHubWorkspaceRepository } from '@shared/github';

interface GitHubState {
  connection: GitHubConnection | null;
  repositories: GitHubWorkspaceRepository[];
  selectedOwner: string;
  searchQuery: string;
  loading: boolean;
  importingFullName: string | null;

  refresh(): Promise<void>;
  setSelectedOwner(owner: string): void;
  setSearchQuery(query: string): void;
  importRepository(repo: Pick<GitHubWorkspaceRepository, 'owner' | 'repo'>): Promise<{
    uid: string;
    slug: string;
    projectPath: string;
  }>;
}

const ALL_OWNERS = 'all';

export const useGitHub = create<GitHubState>((set, get) => ({
  connection: null,
  repositories: [],
  selectedOwner: ALL_OWNERS,
  searchQuery: '',
  loading: false,
  importingFullName: null,

  async refresh(): Promise<void> {
    set({ loading: true });
    try {
      const connection = await window.orbit.github.getConnection();
      const repositories = connection.authenticated
        ? await window.orbit.github.listRepositories()
        : [];
      set({ connection, repositories, loading: false });
    } catch {
      set({ loading: false, repositories: [] });
    }
  },

  setSelectedOwner(owner: string): void {
    set({ selectedOwner: owner });
  },

  setSearchQuery(query: string): void {
    set({ searchQuery: query });
  },

  async importRepository(repo): Promise<{ uid: string; slug: string; projectPath: string }> {
    const fullName = `${repo.owner}/${repo.repo}`;
    set({ importingFullName: fullName });
    try {
      const result = await window.orbit.github.importRepository({
        owner: repo.owner,
        repo: repo.repo
      });
      await get().refresh();
      return result;
    } finally {
      set({ importingFullName: null });
    }
  }
}));

export { ALL_OWNERS as GITHUB_ALL_OWNERS };
