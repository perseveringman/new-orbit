---
status: completed
created: 2026-04-23
updated: 2026-04-23
---

# Contextual Right Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current global right sidebar with a contextual, two-level sidebar that follows the active surface, user intent, and focused entity across the Orbit workspace.

**Architecture:** Introduce a dedicated sidebar domain model separate from the generic pane store. Shared sidebar panels remain single implementations, while surface profiles declare which top-level intents and second-level panels are available for each workspace surface such as editor, dashboard, project kanban, and project terminal. Project Room task details move from a modal to the right sidebar, and terminal mode gets a project task tree overview panel.

**Tech Stack:** React, Zustand, TypeScript, Vitest, Electron renderer architecture

---

### Task 1: Plan and isolate the work

**Files:**
- Modify: `.gitignore`
- Create: `.worktrees/contextual-right-sidebar/`
- Test: `npm test`

**Step 1: Write the failing test**

No product behavior change here. This task is setup-only.

**Step 2: Run test to verify baseline**

Run: `npm test`
Expected: current baseline status is known before implementation starts.

**Step 3: Write minimal implementation**

Add `.worktrees` to `.gitignore`, create a dedicated worktree branch, install dependencies, and use that worktree for all further changes.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: baseline remains unchanged in the new worktree.

**Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore local worktrees"
```

### Task 2: Redesign the sidebar model with tests first

**Files:**
- Modify: `src/renderer/src/views/vaultRightSidebarModel.ts`
- Test: `tests/vault_right_sidebar_model.test.ts`

**Step 1: Write the failing test**

Add tests that assert:
- surfaces expose top-level intents instead of flat tabs
- `project.kanban` and `project.terminal` expose different panel sets
- fallback logic selects a valid intent/panel when the previous one is unavailable

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/vault_right_sidebar_model.test.ts`
Expected: FAIL because the current model only supports `visibleIn` and flat tabs.

**Step 3: Write minimal implementation**

Replace the flat tab model with:
- surface ids
- intent ids
- shared panel ids
- surface profile lookup helpers
- panel fallback helpers

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/vault_right_sidebar_model.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/vault_right_sidebar_model.test.ts src/renderer/src/views/vaultRightSidebarModel.ts
git commit -m "feat: add contextual sidebar profiles"
```

### Task 3: Add a dedicated sidebar state store

**Files:**
- Create: `src/renderer/src/store/sidebar.ts`
- Test: `tests/sidebar_store.test.ts`

**Step 1: Write the failing test**

Add tests that assert:
- surface changes restore the remembered intent/panel for that surface
- focus updates do not reset the selected panel
- invalid surface/panel combinations fall back to that surface's default profile

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/sidebar_store.test.ts`
Expected: FAIL because the store does not exist.

**Step 3: Write minimal implementation**

Create a Zustand store for:
- `surface`
- `intent`
- `panel`
- `focus`
- remembered selection per surface

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/sidebar_store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/sidebar_store.test.ts src/renderer/src/store/sidebar.ts
git commit -m "feat: add contextual sidebar store"
```

### Task 4: Move project task details into the sidebar

**Files:**
- Modify: `src/renderer/src/views/projectRoomModel.ts`
- Modify: `src/renderer/src/views/ProjectRoomView.tsx`
- Create: `src/renderer/src/components/Sidebar/TaskDetailPanel.tsx`
- Create: `src/renderer/src/components/Sidebar/ProjectTaskTreePanel.tsx`
- Test: `tests/project_room_model.test.ts`

**Step 1: Write the failing test**

Update tests to assert:
- project room kanban details use the sidebar instead of a modal
- terminal surface resolves to a task-tree overview
- pane hints only target supported focus behavior

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/project_room_model.test.ts`
Expected: FAIL because the model still reports modal behavior.

**Step 3: Write minimal implementation**

Wire task selection to sidebar focus, remove the task details modal path, and add shared panels for:
- selected task details using `TaskEditor`
- project task tree grouped by status for terminal overview

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/project_room_model.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/project_room_model.test.ts src/renderer/src/views/projectRoomModel.ts src/renderer/src/views/ProjectRoomView.tsx src/renderer/src/components/Sidebar/TaskDetailPanel.tsx src/renderer/src/components/Sidebar/ProjectTaskTreePanel.tsx
git commit -m "feat: move project task detail into sidebar"
```

### Task 5: Integrate the two-level sidebar into VaultView

**Files:**
- Modify: `src/renderer/src/views/VaultView.tsx`
- Modify: `src/renderer/src/components/Sidebar/FileTree.tsx`
- Modify: `src/renderer/src/components/Sidebar/BacklinksPanel.tsx`
- Modify: `src/renderer/src/components/Sidebar/TerminalSessionsPanel.tsx`
- Modify: `src/renderer/src/components/Sidebar/AgentPanel.tsx`
- Modify: `src/renderer/src/components/RunLogPane.tsx`
- Modify: `src/renderer/src/components/DiffWorkspacePane.tsx`
- Modify: `src/renderer/src/views/ReviewInboxView.tsx`

**Step 1: Write the failing test**

Extend sidebar model tests with VaultView-driven expectations:
- each surface resolves a valid first-level intent and second-level panel
- shared panels can be mounted under different surfaces without duplicated implementations

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/vault_right_sidebar_model.test.ts tests/project_room_model.test.ts`
Expected: FAIL until VaultView consumes the new model correctly.

**Step 3: Write minimal implementation**

Render:
- first-level intent tabs
- second-level shared panel tabs
- a panel host that switches on shared panel ids

Also feed the store with current surface/focus based on view kind and project room outer tab.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/vault_right_sidebar_model.test.ts tests/project_room_model.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/views/VaultView.tsx src/renderer/src/components/Sidebar/FileTree.tsx src/renderer/src/components/Sidebar/BacklinksPanel.tsx src/renderer/src/components/Sidebar/TerminalSessionsPanel.tsx src/renderer/src/components/Sidebar/AgentPanel.tsx src/renderer/src/components/RunLogPane.tsx src/renderer/src/components/DiffWorkspacePane.tsx src/renderer/src/views/ReviewInboxView.tsx
git commit -m "feat: render two-level contextual sidebar"
```

### Task 6: Validate the redesign

**Files:**
- Modify: `docs/USER_GUIDE.md` (if behavior/user flow text needs updating)
- Test: `tests/vault_right_sidebar_model.test.ts`
- Test: `tests/project_room_model.test.ts`
- Test: `tests/sidebar_store.test.ts`

**Step 1: Write the failing test**

No new product test. Validation task only.

**Step 2: Run test to verify behavior**

Run:
- `npm test -- tests/vault_right_sidebar_model.test.ts tests/project_room_model.test.ts tests/sidebar_store.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm test`

Expected: all pass.

**Step 3: Write minimal implementation**

Only apply final cleanup/documentation changes required to keep tests and docs aligned with shipped behavior.

**Step 4: Run test to verify it passes**

Re-run the same validation commands until green.

**Step 5: Commit**

```bash
git add docs/USER_GUIDE.md
git commit -m "docs: update sidebar behavior"
```
