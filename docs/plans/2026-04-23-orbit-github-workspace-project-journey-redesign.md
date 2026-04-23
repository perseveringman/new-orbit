# Orbit GitHub Workspace + Project Journey Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full GitHub workflow for Orbit with a workspace-level GitHub control plane, project-level GitHub collaboration surfaces, and GitHub-aware normal terminal/Night Shift delivery journeys.

**Architecture:** GitHub becomes a two-level product surface. `Workspace > GitHub` owns account connection, repository discovery, import, and import readiness. `Project > GitHub` owns repository-specific collaboration state such as issues, pull requests, worktrees, branch sync, and Night Shift delivery feedback. The backend stays local-first and `gh`-CLI-backed, while project-local GitHub state persists in `.orbit/config.json`.

**Tech Stack:** Electron main/preload IPC, React + Zustand renderer, TypeScript, `gh` CLI, simple-git, Vitest.

---

## Product design

### 1. Workspace > GitHub

Add a new workspace-level page in the left sidebar:

- account header
- owner/org switcher
- repository explorer
- import queue / recent imports
- import readiness state

This page is the GitHub control plane. It does not replace project execution surfaces.

### 2. Project > GitHub

Extend Project Room with a new `GitHub` outer tab beside Kanban / Terminal / Sessions.

The GitHub tab contains four sub-surfaces:

1. `Overview`
2. `Issues`
3. `PRs`
4. `Worktrees`

These surfaces bind Orbit entities to GitHub entities:

`project -> task -> issue -> branch -> worktree -> PR -> checks/review/merge`

### 3. GitHub-aware development journey

Normal terminal development and Night Shift must share one GitHub-aware delivery model:

1. import or publish repo
2. bind task to issue
3. create/use branch + worktree
4. develop in terminal or Night Shift
5. push / open PR
6. reflect PR / checks / review / merge back into Orbit

---

## Task 1: Persist the redesign contract in shared types and IPC

**Files:**
- Modify: `src/shared/github.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/ipc.test.ts`

**Step 1: Write the failing test**

Extend IPC contract coverage to require:

- workspace GitHub repo listing
- project issues listing
- project PR listing
- task-to-issue binding
- Night Shift GitHub options

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ipc.test.ts`

Expected: FAIL because new GitHub methods and DTOs are not exposed.

**Step 3: Write minimal implementation**

Add shared GitHub DTOs:

- `GitHubWorkspaceRepository`
- `GitHubIssueSummary`
- `GitHubPullRequestDetail`
- `GitHubCheckSummary`
- `GitHubReviewSummary`
- `GitHubWorktreeSummary`
- `GitHubProjectDetails`
- `GitHubTaskBinding`
- `NightShiftGitHubOptions`

Add IPC methods:

- `github.listRepositories`
- `github.getProjectDetails`
- `github.bindTaskIssue`
- `github.unbindTaskIssue`

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ipc.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/shared/github.ts src/shared/ipc.ts src/preload/index.ts tests/ipc.test.ts
git commit -m "feat: extend github ipc contracts"
```

---

## Task 2: Add workspace GitHub backend services

**Files:**
- Create: `src/main/github/workspace.ts`
- Modify: `src/main/github/ipc.ts`
- Modify: `src/main/github/service.ts`
- Test: `tests/github_workspace.test.ts`

**Step 1: Write the failing test**

Create tests covering:

1. `listRepositories()` returns repo cards from `gh repo list`
2. imported repos are marked with linked Orbit project info
3. repo import status distinguishes `not-imported`, `imported`, `needs-attention`

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/github_workspace.test.ts`

Expected: FAIL because workspace repo listing does not exist.

**Step 3: Write minimal implementation**

Implement:

- `listAccessibleGitHubRepositories(vault, owner?, deps?)`
- repo normalization from `gh repo list --json`
- imported project matching through stored GitHub binding in project config
- readiness flags based on `.orbit/config.json`, `.orbit/agent`, and local repo path health

Wire new IPC handler in `src/main/github/ipc.ts`.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/github_workspace.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/github/workspace.ts src/main/github/ipc.ts src/main/github/service.ts tests/github_workspace.test.ts
git commit -m "feat: add workspace github repository listing"
```

---

## Task 3: Add project GitHub detail backend services

**Files:**
- Modify: `src/main/github/service.ts`
- Modify: `src/main/project.ts`
- Modify: `src/main/project_config.ts`
- Test: `tests/github_project_details.test.ts`

**Step 1: Write the failing test**

Add tests covering:

1. `getProjectDetails()` returns overview, issues, PRs, checks, reviews, and worktrees
2. issue binding persists on task markdown/frontmatter or equivalent task metadata
3. worktree summaries join local worktrees to branch/PR state

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/github_project_details.test.ts`

Expected: FAIL because project detail API and issue binding do not exist.

**Step 3: Write minimal implementation**

Implement:

- `getGitHubProjectDetails(vault, projectUid, deps?)`
- `bindTaskToGitHubIssue(vault, taskPath, issueNumber, issueTitle?)`
- `unbindTaskFromGitHubIssue(vault, taskPath)`
- project issue/PR/check/review fetchers through `gh issue list`, `gh pr list`, `gh pr checks`, `gh pr view`
- worktree summary join against existing worktree manager/state

Persist task binding in task frontmatter with GitHub metadata consistent with repo patterns.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/github_project_details.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/github/service.ts src/main/project.ts src/main/project_config.ts tests/github_project_details.test.ts
git commit -m "feat: add project github detail services"
```

---

## Task 4: Add workspace GitHub renderer page

**Files:**
- Modify: `src/renderer/src/store/para.ts`
- Create: `src/renderer/src/store/github.ts`
- Create: `src/renderer/src/views/GitHubWorkspaceView.tsx`
- Modify: `src/renderer/src/views/VaultView.tsx`
- Modify: `src/renderer/src/components/Sidebar/WorkspaceSidebar.tsx`
- Modify: `src/renderer/src/components/topbarModel.ts`
- Test: `tests/github_workspace_view.test.ts`

**Step 1: Write the failing test**

Add renderer tests for:

1. Workspace sidebar shows GitHub entry
2. selecting GitHub renders account header + repository list
3. imported repo card shows `Open Project`
4. non-imported repo card shows `Import`

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/github_workspace_view.test.ts`

Expected: FAIL because the workspace GitHub page does not exist.

**Step 3: Write minimal implementation**

Create a GitHub store that loads:

- connection
- repository list
- selected owner
- import activity

Render `GitHubWorkspaceView` with:

- account header
- search/filter row
- repository explorer
- import readiness badges

Wire navigation through `WorkspaceView = { kind: 'github' }`.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/github_workspace_view.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/store/para.ts src/renderer/src/store/github.ts src/renderer/src/views/GitHubWorkspaceView.tsx src/renderer/src/views/VaultView.tsx src/renderer/src/components/Sidebar/WorkspaceSidebar.tsx src/renderer/src/components/topbarModel.ts tests/github_workspace_view.test.ts
git commit -m "feat: add workspace github page"
```

---

## Task 5: Add Project Room GitHub tab and project GitHub surfaces

**Files:**
- Modify: `src/renderer/src/views/projectRoomModel.ts`
- Modify: `src/renderer/src/views/ProjectRoomView.tsx`
- Create: `src/renderer/src/views/ProjectGitHubView.tsx`
- Create: `src/renderer/src/components/GitHub/ProjectGitHubOverview.tsx`
- Create: `src/renderer/src/components/GitHub/ProjectGitHubIssues.tsx`
- Create: `src/renderer/src/components/GitHub/ProjectGitHubPRs.tsx`
- Create: `src/renderer/src/components/GitHub/ProjectGitHubWorktrees.tsx`
- Test: `tests/project_github_view.test.ts`

**Step 1: Write the failing test**

Add tests covering:

1. linked projects show a `GitHub` outer tab
2. GitHub tab renders Overview / Issues / PRs / Worktrees sub-tabs
3. issues list supports binding an Orbit task to an issue
4. PR/worktree lists render linked branch/PR state

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/project_github_view.test.ts`

Expected: FAIL because no GitHub tab exists in Project Room.

**Step 3: Write minimal implementation**

Add `github` to `ProjectRoomOuterTab`.

Create `ProjectGitHubView` with segmented sub-navigation:

- Overview
- Issues
- PRs
- Worktrees

Use `window.orbit.github.getProjectDetails()` and binding IPC methods. Keep Project Room header strip as summary, but move detailed collaboration into the GitHub tab.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/project_github_view.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/views/projectRoomModel.ts src/renderer/src/views/ProjectRoomView.tsx src/renderer/src/views/ProjectGitHubView.tsx src/renderer/src/components/GitHub tests/project_github_view.test.ts
git commit -m "feat: add project github surfaces"
```

---

## Task 6: Make Night Shift GitHub-aware

**Files:**
- Modify: `src/shared/github.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/night_shift/dispatcher.ts`
- Modify: `src/renderer/src/components/Modals/NightShiftModal.tsx`
- Modify: `src/renderer/src/components/RunLogPane.tsx`
- Test: `tests/night_shift_github.test.ts`

**Step 1: Write the failing test**

Add tests covering:

1. Night Shift plan accepts GitHub execution options
2. dispatcher can create draft PRs with configured base branch
3. Night Shift run/task status reports linked issue/PR/check state
4. GitHub result visibility appears in run log or equivalent history view

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/night_shift_github.test.ts`

Expected: FAIL because Night Shift has no GitHub-aware option set or reporting model.

**Step 3: Write minimal implementation**

Add `github` execution options to Night Shift planning:

- `pushBranch`
- `createDraftPr`
- `baseBranch`
- `reviewers`
- `labels`
- `waitForChecks`

Wire dispatcher to:

- respect GitHub execution intent
- record PR URL/number/check summary in task status
- expose GitHub result summary back to the renderer

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/night_shift_github.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/shared/github.ts src/shared/ipc.ts src/main/night_shift/dispatcher.ts src/renderer/src/components/Modals/NightShiftModal.tsx src/renderer/src/components/RunLogPane.tsx tests/night_shift_github.test.ts
git commit -m "feat: make night shift github aware"
```

---

## Task 7: Refresh docs and implementation report

**Files:**
- Create: `docs/plans/2026-04-23-orbit-github-workspace-project-journey-report.md`
- Modify: `docs/plans/2026-04-23-orbit-github-integration-blueprint.md`
- Test: none beyond full verification

**Step 1: Write the implementation report**

Document:

- shipped workspace GitHub page
- shipped project GitHub tab and binding model
- shipped Night Shift GitHub-aware flow
- tradeoffs and current boundaries

**Step 2: Update blueprint**

Align blueprint language with implemented architecture.

**Step 3: Verify docs are accurate**

Cross-check report against code and UI.

**Step 4: Commit**

```bash
git add docs/plans/2026-04-23-orbit-github-workspace-project-journey-report.md docs/plans/2026-04-23-orbit-github-integration-blueprint.md
git commit -m "docs: add github redesign implementation report"
```

---

## Final verification

Run:

```bash
npm test
npm run typecheck
```

Expected:

- all tests pass
- typecheck passes
- new workspace GitHub page is routed from sidebar
- linked projects show GitHub tab and detailed GitHub surfaces
- Night Shift exposes GitHub execution controls and result state

---

## Suggested implementation order for this session

1. shared contracts
2. backend workspace/project GitHub services
3. workspace GitHub page
4. project GitHub tab
5. Night Shift GitHub journey
6. full verification
7. implementation report
