---
status: draft
created: 2026-04-24
updated: 2026-04-24
---

# Orbit Workspace Inspector Files + Changes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a new right-side Workspace Inspector for Orbit with Superset-inspired `Files` and `Changes` tabs, polished light/dark theming, lucide-react icons, grouped diff browsing, and safe commit/publish workflows.

**Architecture:** Keep Orbit's existing contextual right sidebar shell, but replace the old split `files` / `diff` experience with a dedicated `inspector` panel that owns its own tab state and row models. Project surfaces use a new full project file-tree data source and staged-aware git change actions; non-project surfaces keep the existing markdown-oriented vault tree so PARA navigation does not regress.

**Tech Stack:** Electron main/preload IPC, React 18, Zustand, Tailwind CSS, TypeScript, simple-git, lucide-react, Vitest.

---

## Current-state constraints to respect

- `src/main/fs.ts` currently builds a vault tree from **directories + `.md` files only**.
- `src/main/git/ipc.ts` exposes `git:getDiff`, but the legacy `git:commit` still does a vault-root `git add -A`.
- `ProjectSummaryDTO` already exposes `path`, so renderer code can request project-local file trees without inventing another lookup API.
- Renderer component tests in this repo use `renderToStaticMarkup` instead of React Testing Library.
- User decision for this feature: **all new icons use `lucide-react`**, and **discarding untracked files should delete them only after a strong confirmation step**.

---

## Task 1: Route a single `inspector` panel through the right sidebar

**Files:**
- Create: `src/renderer/src/components/Inspector/WorkspaceInspectorPane.tsx`
- Modify: `src/renderer/src/views/vaultRightSidebarModel.ts`
- Modify: `src/renderer/src/store/sidebar.ts`
- Modify: `src/renderer/src/views/VaultView.tsx`
- Test: `tests/vault_right_sidebar_model.test.ts`
- Test: `tests/sidebar_store.test.ts`

**Step 1: Write the failing tests**

Add coverage that:

1. `editor`, `areaRoom`, and every `project.*` surface can expose `inspector`
2. the sidebar store can remember and reopen `inspector`
3. `VaultView` renders the new pane instead of the old split `files` / `diff` branch

```ts
expect(getSidebarPanelTabs('editor', 'overview').map((tab) => tab.id)).toContain('inspector');
useSidebar.getState().openPanel({ panel: 'inspector' });
expect(useSidebar.getState().panel).toBe('inspector');
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/vault_right_sidebar_model.test.ts tests/sidebar_store.test.ts`

Expected: FAIL because `inspector` is not a valid panel id and `VaultView` does not render it.

**Step 3: Write minimal implementation**

Add the new panel id and route it everywhere the new Inspector should be available:

```ts
export type SidebarPanelId =
  | 'inspector'
  | 'area-config'
  | 'backlinks'
  | 'task-detail'
  | 'task-tree'
  | 'agent'
  | 'worktrees'
  | 'review'
  | 'runlog'
  | 'sessions';
```

Render a placeholder shell first:

```tsx
if (sidebarPanel === 'inspector') {
  return <WorkspaceInspectorPane />;
}
```

Keep the old `FileTree` and `DiffWorkspacePane` code in place until later tasks finish migrating callers.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/vault_right_sidebar_model.test.ts tests/sidebar_store.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/vault_right_sidebar_model.test.ts tests/sidebar_store.test.ts src/renderer/src/views/vaultRightSidebarModel.ts src/renderer/src/store/sidebar.ts src/renderer/src/views/VaultView.tsx src/renderer/src/components/Inspector/WorkspaceInspectorPane.tsx
git commit -m "feat(renderer): 引入 workspace inspector 右侧面板骨架"
```

---

## Task 2: Add lucide-react, inspector state, and panel theming tokens

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tailwind.config.cjs`
- Modify: `src/renderer/src/styles.css`
- Create: `src/renderer/src/store/workspaceInspector.ts`
- Create: `src/renderer/src/components/Inspector/inspectorTheme.ts`
- Modify: `src/renderer/src/components/Inspector/WorkspaceInspectorPane.tsx`
- Test: `tests/workspace_inspector_store.test.ts`
- Test: `tests/workspace_inspector_shell.test.ts`

**Step 1: Write the failing tests**

Add a store test for the minimum state contract:

```ts
expect(useWorkspaceInspector.getState().activeTab).toBe('files');
useWorkspaceInspector.getState().selectTab('changes');
expect(useWorkspaceInspector.getState().activeTab).toBe('changes');
```

Add a shell render test that expects:

1. `Files` and `Changes` tab labels
2. lucide icon placeholders rendered through the shell
3. panel classes built from semantic inspector tokens rather than raw `neutral-*` everywhere

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/workspace_inspector_store.test.ts tests/workspace_inspector_shell.test.ts`

Expected: FAIL because the store, shell state, and classes do not exist.

**Step 3: Write minimal implementation**

Install lucide and add a dedicated inspector store:

```bash
npm install lucide-react
```

```ts
interface WorkspaceInspectorState {
  activeTab: 'files' | 'changes';
  fileQuery: string;
  changeQuery: string;
  selectedPath: string | null;
  commitMessage: string;
  expanded: Record<string, boolean>;
}
```

Add theme tokens for:

- `inspector-surface-0/1/2/3`
- `inspector-border-subtle/strong`
- `inspector-text-primary/secondary/dim`
- `inspector-git-added/modified/deleted/renamed`
- `inspector-accent`

Use these tokens in `WorkspaceInspectorPane` so the panel shell is stable before either tab is implemented.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/workspace_inspector_store.test.ts tests/workspace_inspector_shell.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json package-lock.json tailwind.config.cjs src/renderer/src/styles.css src/renderer/src/store/workspaceInspector.ts src/renderer/src/components/Inspector/inspectorTheme.ts src/renderer/src/components/Inspector/WorkspaceInspectorPane.tsx tests/workspace_inspector_store.test.ts tests/workspace_inspector_shell.test.ts
git commit -m "feat(renderer): 搭建 inspector 状态与主题骨架"
```

---

## Task 3: Extend file-system IPC for full project trees and folder creation

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Create: `src/main/project_fs.ts`
- Modify: `src/main/fs.ts`
- Test: `tests/project_fs.test.ts`
- Test: `tests/ipc.test.ts`

**Step 1: Write the failing tests**

Add tests that require:

1. a project-local tree API that returns non-Markdown files too
2. a `createDirectory` operation
3. ignored heavy directories (`.git`, `node_modules`, `.orbit`) still excluded

```ts
expect(tree.children?.map((node) => node.name)).toContain('src');
expect(tree.children?.map((node) => node.name)).toContain('package.json');
await window.orbit.fs.createDirectory(projectPath, 'components');
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/project_fs.test.ts tests/ipc.test.ts`

Expected: FAIL because Orbit only exposes the markdown-oriented `fs:listTree` / `fs:createFile` surface.

**Step 3: Write minimal implementation**

Create a dedicated helper instead of bloating `fs.ts` further:

```ts
export interface ProjectFileNode {
  name: string;
  path: string;
  relPath: string;
  isDir: boolean;
  children?: ProjectFileNode[];
}
```

Add new IPC:

```ts
fs: {
  listProjectTree: 'fs:listProjectTree',
  createDirectory: 'fs:createDirectory',
}
```

Implementation rules:

1. `listProjectTree(root)` returns a full text-oriented project tree
2. keep existing vault `listTree()` markdown-only for PARA/editor surfaces
3. `createDirectory(parent, name)` rejects `..`, `/`, and `\\`
4. binary files may appear in the tree, but opening them will be guarded later in renderer code

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/project_fs.test.ts tests/ipc.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/ipc.ts src/preload/index.ts src/main/project_fs.ts src/main/fs.ts tests/project_fs.test.ts tests/ipc.test.ts
git commit -m "feat(main): 增加 project 文件树与新建文件夹 ipc"
```

---

## Task 4: Build the Files tab with Superset-style search, toolbar, and tree rows

**Files:**
- Create: `src/renderer/src/components/Inspector/files/buildFileRows.ts`
- Create: `src/renderer/src/components/Inspector/files/FilesPanel.tsx`
- Create: `src/renderer/src/components/Inspector/files/FilesTree.tsx`
- Modify: `src/renderer/src/components/Inspector/WorkspaceInspectorPane.tsx`
- Modify: `src/renderer/src/store/workspaceInspector.ts`
- Modify: `src/renderer/src/store/files.ts`
- Test: `tests/workspace_inspector_files_panel.test.ts`
- Test: `tests/file_tree_navigation.test.ts`

**Step 1: Write the failing tests**

Add tests that verify:

1. the Files tab renders `Search files...`
2. toolbar actions render with lucide icons (`FilePlus`, `FolderPlus`, `RefreshCw`, `FoldVertical`)
3. filtering keeps ancestor directories visible
4. project surfaces use the new full project tree, while non-project surfaces keep the old vault markdown tree

```ts
expect(html).toContain('Search files');
expect(html).toContain('New File');
expect(html).toContain('src');
expect(html).toContain('README');
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/workspace_inspector_files_panel.test.ts tests/file_tree_navigation.test.ts`

Expected: FAIL because the Files tab UI and row builder do not exist.

**Step 3: Write minimal implementation**

Build a pure row adapter first:

```ts
const filtered = applyFileQuery(root, query);
const rows = flattenFileTree(filtered, expanded);
```

Then render a Superset-inspired panel:

```tsx
<header>
  <InspectorSearch value={fileQuery} placeholder="Search files..." />
  <IconButton icon={FilePlus} label="New File" />
  <IconButton icon={FolderPlus} label="New Folder" />
  <IconButton icon={RefreshCw} label="Refresh" />
  <IconButton icon={FoldVertical} label="Collapse All" />
</header>
```

Behavior rules:

1. project surfaces open from `ProjectSummaryDTO.path`
2. non-project surfaces still use `useFiles().tree`
3. clicking a text file routes through the existing open flow
4. clicking a binary file shows a toast instead of pushing junk into the editor

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/workspace_inspector_files_panel.test.ts tests/file_tree_navigation.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/components/Inspector/files/buildFileRows.ts src/renderer/src/components/Inspector/files/FilesPanel.tsx src/renderer/src/components/Inspector/files/FilesTree.tsx src/renderer/src/components/Inspector/WorkspaceInspectorPane.tsx src/renderer/src/store/workspaceInspector.ts src/renderer/src/store/files.ts tests/workspace_inspector_files_panel.test.ts tests/file_tree_navigation.test.ts
git commit -m "feat(renderer): 完成 inspector files 面板交互"
```

---

## Task 5: Upgrade git IPC to support staged-aware change actions and safe commits

**Files:**
- Modify: `src/shared/git.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Create: `src/main/git/status.ts`
- Modify: `src/main/git/diff.ts`
- Modify: `src/main/git/ipc.ts`
- Modify: `src/mcp/tools.ts`
- Test: `tests/git_diff.test.ts`
- Test: `tests/git_changes_actions.test.ts`
- Test: `tests/ipc.test.ts`

**Step 1: Write the failing tests**

Add tests that require:

1. staged / unstaged / untracked counts per file or path group
2. `stagePaths`, `unstagePaths`, and `discardPaths`
3. a new safe commit API that does **not** blindly `git add -A`

```ts
expect(summary.stagedCount).toBe(1);
await gitApi.stagePaths({ cwd, paths: ['src/app.ts'] });
await gitApi.unstagePaths({ cwd, paths: ['src/app.ts'] });
await gitApi.discardPaths({ cwd, paths: ['tmp.txt'] });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/git_diff.test.ts tests/git_changes_actions.test.ts tests/ipc.test.ts`

Expected: FAIL because Orbit only exposes merge-base diff and the unsafe legacy commit path.

**Step 3: Write minimal implementation**

Extract the porcelain parser now duplicated in `src/mcp/tools.ts`:

```ts
export function parsePorcelainStatus(lines: string[]) {
  // return staged / unstaged / untracked counts + file entries
}
```

Expose new IPC:

```ts
git: {
  getChanges: 'git:getChanges',
  stagePaths: 'git:stagePaths',
  unstagePaths: 'git:unstagePaths',
  discardPaths: 'git:discardPaths',
  commitSelection: 'git:commitSelection',
}
```

Behavior rules:

1. tracked discard uses `git restore --worktree --source=HEAD -- <paths>`
2. staged rollback uses `git restore --staged -- <paths>`
3. untracked discard deletes files only after renderer confirmation
4. keep legacy `git:commit` for backward compatibility, but do not use it from the Inspector

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/git_diff.test.ts tests/git_changes_actions.test.ts tests/ipc.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/shared/git.ts src/shared/ipc.ts src/preload/index.ts src/main/git/status.ts src/main/git/diff.ts src/main/git/ipc.ts src/mcp/tools.ts tests/git_diff.test.ts tests/git_changes_actions.test.ts tests/ipc.test.ts
git commit -m "feat(main): 增加 staged 感知的 changes git 动作"
```

---

## Task 6: Build the Changes tab, grouped diff tree, commit bar, and publish actions

**Files:**
- Create: `src/renderer/src/components/Inspector/changes/buildChangeRows.ts`
- Create: `src/renderer/src/components/Inspector/changes/ChangesPanel.tsx`
- Create: `src/renderer/src/components/Inspector/changes/ChangesTree.tsx`
- Create: `src/renderer/src/components/Inspector/changes/CommitBar.tsx`
- Create: `src/renderer/src/components/Inspector/changes/diffFormatting.ts`
- Create: `src/renderer/src/components/Inspector/changes/DiffViewer.tsx`
- Modify: `src/renderer/src/components/DiffPane.tsx`
- Modify: `src/renderer/src/components/Inspector/WorkspaceInspectorPane.tsx`
- Modify: `src/renderer/src/store/workspaceInspector.ts`
- Modify: `src/renderer/src/views/ProjectGitHubView.tsx`
- Modify: `src/renderer/src/views/ProjectRoomView.tsx`
- Test: `tests/workspace_inspector_changes_panel.test.ts`
- Test: `tests/diff_pane_helpers.test.ts`
- Test: `tests/project_github_view.test.ts`

**Step 1: Write the failing tests**

Add coverage that:

1. the Changes tab renders grouped directory headers and file counts
2. file rows render git status, additions, deletions, and selection state
3. diff rendering reuses shared patch-format helpers
4. commit / publish controls render without `window.prompt`

```ts
expect(html).toContain('Changes');
expect(html).toContain('files changed');
expect(html).toContain('Commit message');
expect(html).toContain('Publish');
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/workspace_inspector_changes_panel.test.ts tests/diff_pane_helpers.test.ts tests/project_github_view.test.ts`

Expected: FAIL because the grouped Changes panel, commit bar, and prompt-free publish flow do not exist.

**Step 3: Write minimal implementation**

Create a pure grouping adapter:

```ts
const groups = groupChangesByDirectory(files);
const rows = flattenChangeGroups(groups, expanded);
```

Extract patch helpers out of `DiffPane.tsx`:

```ts
export function classifyPatch(patch: string): PatchLine[] { ... }
export function formatShortSha(sha: string): string { ... }
```

Render a panel with:

1. branch/base summary
2. grouped change tree
3. unified diff preview
4. commit message input + commit CTA
5. publish / create PR actions wired to existing GitHub APIs

Do **not** call `window.prompt` or `window.confirm` from the final Inspector UI. Use controlled component state inside the panel for message / publish form inputs. Keep `ProjectGitHubView` aligned by reusing the same action helpers or child components.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/workspace_inspector_changes_panel.test.ts tests/diff_pane_helpers.test.ts tests/project_github_view.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/components/Inspector/changes/buildChangeRows.ts src/renderer/src/components/Inspector/changes/ChangesPanel.tsx src/renderer/src/components/Inspector/changes/ChangesTree.tsx src/renderer/src/components/Inspector/changes/CommitBar.tsx src/renderer/src/components/Inspector/changes/diffFormatting.ts src/renderer/src/components/Inspector/changes/DiffViewer.tsx src/renderer/src/components/DiffPane.tsx src/renderer/src/components/Inspector/WorkspaceInspectorPane.tsx src/renderer/src/store/workspaceInspector.ts src/renderer/src/views/ProjectGitHubView.tsx src/renderer/src/views/ProjectRoomView.tsx tests/workspace_inspector_changes_panel.test.ts tests/diff_pane_helpers.test.ts tests/project_github_view.test.ts
git commit -m "feat(renderer): 完成 inspector changes 工作台"
```

---

## Task 7: Final integration pass, docs, and release notes

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/plans/2026-04-24-orbit-workspace-inspector-files-changes.md`

**Step 1: Write the failing doc/tests checklist**

Create the release checklist in the plan and treat any missing item as failure:

1. architecture mentions the new Inspector domain and IPC
2. user guide explains Files vs Changes behavior
3. roadmap reflects the new right-side code workspace
4. changelog has an `[Unreleased]` entry

**Step 2: Run verification before updating docs**

Run:

```bash
npm run typecheck
npm run lint
npm test
```

Expected: PASS. If any command fails, fix code before touching docs.

**Step 3: Write the minimal documentation updates**

Document:

- the new `inspector` sidebar panel
- project-local file tree scope vs vault markdown tree scope
- staged-aware commit / publish workflow
- the fact that all new explorer icons use `lucide-react`

Then update this plan frontmatter from `draft` to `completed`.

**Step 4: Re-run verification**

Run:

```bash
npm run typecheck && npm run lint && npm test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/architecture.md docs/ROADMAP.md docs/USER_GUIDE.md CHANGELOG.md docs/plans/2026-04-24-orbit-workspace-inspector-files-changes.md
git commit -m "docs(renderer): 记录 workspace inspector files 与 changes 工作台"
```

