---

description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: The examples below include test tasks. Tests are OPTIONAL - only include them if explicitly requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Main process**: `src/main/`
- **Preload bridge**: `src/preload/`
- **Shared contracts/types**: `src/shared/`
- **Renderer UI/state**: `src/renderer/src/`
- **Unit/integration tests**: `tests/`
- **Electron e2e flows**: `e2e/`
- **Durable docs**: `docs/` and `CHANGELOG.md`
- Paths shown below assume Orbit's default desktop-app structure - adjust based
  on plan.md

<!-- 
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.
  
  The /speckit.tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/
  
  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment
  
  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Capture affected Orbit surfaces and docs sync targets in the plan
- [ ] T002 [P] Identify concrete file paths in `src/main/`, `src/preload/`, `src/shared/`, `src/renderer/src/`, `tests/`, `e2e/`, and `docs/`
- [ ] T003 [P] Confirm validation commands (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`) and any required e2e coverage

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T004 [P] Update shared contracts/types or IPC declarations in `src/shared/`
- [ ] T005 [P] Add main/preload plumbing for the feature in `src/main/` and `src/preload/`
- [ ] T006 [P] Prepare renderer/store scaffolding in `src/renderer/src/`
- [ ] T007 Create or update shared fixtures/test helpers in `tests/` (and `e2e/` if needed)
- [ ] T008 Configure explicit error handling/logging paths for affected flows
- [ ] T009 Record required documentation touchpoints in `docs/` and `CHANGELOG.md`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1 (OPTIONAL - only if tests requested) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T010 [P] [US1] Add or update unit/integration coverage in `tests/[name].test.ts`
- [ ] T011 [P] [US1] Add or update Electron flow coverage in `e2e/[name].spec.ts` when the story changes a user-visible workflow

### Implementation for User Story 1

- [ ] T012 [P] [US1] Update shared contracts/schema in `src/shared/[file].ts`
- [ ] T013 [P] [US1] Implement main/preload support in `src/main/[file].ts` and `src/preload/[file].ts`
- [ ] T014 [US1] Implement renderer/store behavior in `src/renderer/src/[location]/[file].tsx`
- [ ] T015 [US1] Wire the end-to-end feature flow across all affected surfaces
- [ ] T016 [US1] Add validation and explicit error handling
- [ ] T017 [US1] Update durable docs for User Story 1 if the behavior or architecture changes

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2 (OPTIONAL - only if tests requested) ⚠️

- [ ] T018 [P] [US2] Add or update unit/integration coverage in `tests/[name].test.ts`
- [ ] T019 [P] [US2] Add or update Electron flow coverage in `e2e/[name].spec.ts` when needed

### Implementation for User Story 2

- [ ] T020 [P] [US2] Update shared/main/preload contracts for the story
- [ ] T021 [US2] Implement the core logic in the owning Orbit surface
- [ ] T022 [US2] Implement renderer/store updates and UI states
- [ ] T023 [US2] Integrate with User Story 1 components (if needed) without breaking independent testability

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3 (OPTIONAL - only if tests requested) ⚠️

- [ ] T024 [P] [US3] Add or update unit/integration coverage in `tests/[name].test.ts`
- [ ] T025 [P] [US3] Add or update Electron flow coverage in `e2e/[name].spec.ts` when needed

### Implementation for User Story 3

- [ ] T026 [P] [US3] Update the required shared/main/preload surfaces
- [ ] T027 [US3] Implement the core logic in the owning Orbit surface
- [ ] T028 [US3] Implement renderer/store updates and UI states

**Checkpoint**: All user stories should now be independently functional

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates in docs/
- [ ] TXXX [P] Changelog update in `CHANGELOG.md`
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization across all stories
- [ ] TXXX [P] Additional unit/integration tests in `tests/` and `e2e/` as needed
- [ ] TXXX Security hardening
- [ ] TXXX Run the repository validation commands

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Shared contracts before cross-process wiring
- Cross-process wiring before renderer integration
- Core implementation before docs/changelog sync
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (if tests requested):
Task: "Add or update unit/integration coverage in tests/[name].test.ts"
Task: "Add or update Electron coverage in e2e/[name].spec.ts"

# Launch cross-surface groundwork for User Story 1 together:
Task: "Update shared contracts/schema in src/shared/[file].ts"
Task: "Implement main/preload support in src/main/[file].ts and src/preload/[file].ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before marking the work complete
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
