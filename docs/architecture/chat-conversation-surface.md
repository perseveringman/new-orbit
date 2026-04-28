# Chat / Conversation Surface Architecture

> **Status**: accepted draft
> **Purpose**: 定义 Orbit 内所有 chat 体验的统一组件模型，保证弹层、全页、任务内、Area/Resource 内的会话体验一致且互通。

---

## 1. Core principle

Chat is not a runtime. Chat is a reusable consumption surface over a first-class Conversation entity.

所有入口——Ask-Anywhere 弹层、Ask-Anywhere 全页、Task Activity、Resource-scoped chat、Area-scoped chat——都应复用同一个 conversation component family。

---

## 2. Conversation as first-class data

Conversation belongs to Layer 1 when user starts or saves it. It can be referenced by Layer 2 synthesis and rendered by Layer 3 chat surfaces.

```typescript
export interface Conversation {
  id: string;
  title: string;
  scope: ConversationScope;
  created_at: string;
  updated_at: string;
  last_message_at?: string;
  runtime_hint?: string;
  messages: ConversationMessage[];
  artifacts?: ConversationArtifactRef[];
  archived?: boolean;
}

export type ConversationScope =
  | { kind: 'global' }
  | { kind: 'task'; task_id: string; project_id?: string }
  | { kind: 'project'; project_id: string }
  | { kind: 'area'; area_slug: string }
  | { kind: 'resource'; resource_slug: string }
  | { kind: 'note'; note_id: string }
  | { kind: 'library'; item_id: string };
```

---

## 3. Overlay and full page are the same conversation

The floating Ask-Anywhere overlay is a conversation surface, not a separate feature.

Rules:

- Opening overlay defaults to the last active global conversation.
- Overlay top has a dropdown to switch conversations.
- User can create a new conversation from overlay.
- Opening full page shows the same conversation state.
- Sending a message in overlay appears in full page immediately.
- Any artifact/stage generated in overlay is visible in full page.

```text
Ask-Anywhere Overlay ─┐
                      ├── Conversation Store ─── Runtime Router
Ask-Anywhere Page ────┘
```

---

## 4. Component family

```text
components/conversation/
├── ConversationShell.tsx          # layout + lifecycle
├── ConversationHeader.tsx         # title / scope / dropdown / actions
├── ConversationListDropdown.tsx   # switch / new / archive
├── MessageTimeline.tsx            # unified message render
├── MessageComposer.tsx            # input / attachments / slash actions
├── RuntimeStatusBar.tsx           # endpoint / model / cost / running
├── ArtifactStage.tsx              # optional right stage
├── ApprovalCards.tsx              # accept/reject suggestions
└── hooks/
    ├── useConversation.ts
    ├── useConversationRuntime.ts
    └── useConversationArtifacts.ts
```

No surface should reimplement chat message rendering.

---

## 5. Stage View

A conversation may produce artifacts. Stage View is the optional right-side product panel.

Artifacts include:

- proposal
- markdown document
- resource suggestion
- area assignment suggestion
- chart/table
- diff/review result
- synthesis artifact preview

Overlay behavior:

- Compact overlay may show stage as a tab or collapsible panel.
- Full page shows chat left + stage right.
- Same artifact IDs, same accept/reject actions.

---

## 6. Context injection by scope

Conversation scope determines default context:

| scope | default context |
|---|---|
| global | recent timeline + user vision + active projects |
| task | task definition + active run + project context |
| project | project README + tasks + recent events |
| area | area README + active projects + resources + recent notes |
| resource | resource index + refs + timeline |
| note | note body + backlinks |
| library | library item + annotations + related resources |

The user can still override context explicitly.

---

## 7. Runtime route

Default runtime:

- Global / Area / Resource / Note / Library chat → Track B SDK
- Task execution chat → Track A CLI runtime bound to task/session
- Project-level implementation request → starts or attaches to task runtime

Conversation shell does not choose directly; it calls runtime router with scope and mode.

---

## 8. Message rendering

All chat surfaces render the same event classes:

- user message
- assistant delta / message
- tool use
- tool result
- thinking summary（if available）
- cost / budget event
- approval card
- artifact card
- system notice

Task Activity and Ask-Anywhere should use the same render primitives, even if task activity has extra execution-specific affordances.

---

## 9. Persistence

Suggested storage:

```text
<vault>/.orbit/conversations/
├── index.json
└── <conversation-id>.json
```

Materialization is optional:

- User can “Save conversation as note” → `notes/captures/<id>.md`
- Daily Timeline can show `conversation.meaningful` events based on heuristics
- Synthesis can generate `summary.entity` for long conversations

---

## 10. Acceptance criteria

- Overlay and full page share the same conversation.
- Overlay default is last active conversation, with dropdown and new conversation action.
- Task Activity, Ask-Anywhere, and scoped chats use shared message render primitives.
- Stage View artifacts are shared between overlay and full page.
- Scope context injection works consistently.
