# AI Composer Unification — 统一富输入与 Runtime/Model 选择架构

> **Status**: proposal / architecture design
> **Date**: 2026-05-16
> **Scope**: 统一 Orbit 内所有 AI chat 输入框；支持模型显示/切换、runtime 切换、agent profile 切换、文件上传、语音输入与附件安全落库。
> **Related docs**: `docs/VISION.md`, `docs/ROADMAP.md`, `docs/architecture.md`, `docs/plans/2026-04-28-ask-anywhere-ux-revamp.md`, `docs/plans/phase-5-runtime-synthesis-conversation.md`
> **Related code**: `src/shared/chat-protocol/*`, `src/shared/conversation/types.ts`, `src/shared/runtime/*`, `src/main/ask-anywhere/orchestrator.ts`, `src/renderer/src/components/chat/*`, `src/renderer/src/components/quick-capture/*`

---

## 1. 背景

当前 Orbit 已经有 Conversation / RuntimeEvent / Runtime Router 的基础，但输入侧仍然割裂：

| Surface | 当前输入 | 问题 |
| --- | --- | --- |
| Ask Anywhere full page | `ChatView` 内置 `InputArea` | 只能发纯文本，不能选择 runtime/model，不能带附件 |
| Ask Anywhere floating bar | 独立手写 input | 和 full page 不共享 UI/能力，容易再次分叉 |
| Task / Inbox chat | 复用 `ChatView` 输入 | 同样只能发纯文本，且未来需要任务上下文附件 |
| Quick Capture | 独立 Modal | 已有文件/语音录制能力，但和 AI chat 协议无关 |
| Runtime workspace / Settings | 管理 runtime 和 SDK endpoint | 用户选择没有进入 chat 输入链路 |

用户期望的输入框不是一个更大的 textarea，而是一个 **AI Composer**：

- 顶部显示并切换当前模型，例如 `GPT-5.2`
- 显示并切换当前 agent profile / runtime mode，例如 `Creative Agent`
- 支持上传文件、图片、截图、URL、语音输入
- 支持把同一能力复用到所有 AI chat surface
- 底层 runtime/model 选择要真正影响执行，而不是 UI 装饰

这与 Orbit 的 AI-native 原则一致：UI 是人的界面，runtime / CLI / SDK 是 agent 的能力界面，二者必须走同一套业务协议。

---

## 2. 目标与非目标

### 2.1 目标

1. 新增一个共享 `AIComposer` 组件，替代所有 chat surface 的 `InputArea` 和手写输入框。
2. 将 `chat.send_message` 从纯文本 payload 升级为 `ComposerDraft` payload，同时保持旧 `text` 兼容。
3. 引入 `ComposerAttachment` 和 `ConversationAttachmentStore`，把用户选择的文件安全落到 `.orbit/` 下，作为 conversation turn 的可审计输入。
4. 引入 `RuntimeSelection`，把 runtime / endpoint / model / model tier / agent profile 的选择持久化到 conversation，并传入 `RuntimeRouter.decide()`。
5. 在 runtime capability 不支持附件或语音时，UI 能降级或阻止发送，而不是让 orchestrator 随机失败。
6. 复用 Quick Capture 已有的录音与文件读取经验，但不要让 Quick Capture 成为 chat 的依赖。

### 2.2 非目标

- 不在本期实现所有 provider 的原生多模态 API。先把协议和存储打通，再逐步为 SDK / CLI runtime 适配。
- 不把 Ask Anywhere 做成 ChatGPT 克隆。它仍然是 Orbit 的执行入口，附件也必须遵守本地优先、可追踪、可审批原则。
- 不让 agent 自动读取用户电脑任意路径。用户选择的文件可以进入 attachment store；未选择的外部路径仍走 existing external path approval。

---

## 3. 核心概念

### 3.1 AIComposer

`AIComposer` 是所有 AI 输入框的共享组件，不直接调用业务 IPC。它只管理本地 draft 状态并通过 `onSubmit(draft)` 回调交给 host。

```ts
interface AIComposerProps {
  conversationId: string;
  scope: ConversationScope;
  disabled?: boolean;
  density: 'floating' | 'compact' | 'full';
  placeholder?: string;
  selection: RuntimeSelection;
  options: ComposerOptions;
  capabilities: ComposerCapabilities;
  onSelectionChange(selection: RuntimeSelection): void;
  onSubmit(draft: ComposerDraft): void;
  onStop?(): void;
}
```

三种 density 共享能力，只调整尺寸：

| Density | 使用位置 | 行为 |
| --- | --- | --- |
| `floating` | 底部悬浮 Ask Anywhere | 图标更紧凑，最多 1-2 行附件预览 |
| `compact` | 右侧 Ask companion / Inbox chat | 中等高度，保留主要 controls |
| `full` | Ask Anywhere full page / Task chat | 完整 composer，附件 strip 和 model controls 常驻 |

### 3.2 ComposerDraft

`ComposerDraft` 是用户真正提交的输入，而不是一个字符串。

```ts
interface ComposerDraft {
  text: string;
  attachments: ComposerAttachmentRef[];
  voice?: ComposerVoiceInput;
  selection: RuntimeSelection;
  intent?: ComposerIntent;
  clientMeta?: {
    submittedAt: string;
    sourceSurface: 'ask_floating' | 'ask_full' | 'task_chat' | 'inbox_chat' | 'sidebar_ask';
  };
}
```

`intent` 用于表达 UI 上的模式按钮，例如“搜索网页”“生成 JSON”“写作”“执行任务”。它不替代 system prompt，只是传给 host 做 prompt/context hint。

### 3.3 RuntimeSelection

当前代码已有 `ConversationMeta.runtimeHint/runtimeEndpointHint/runtimeModelHint`，但语义偏散。统一为 selection 后仍可兼容写回这些字段。

```ts
interface RuntimeSelection {
  runtimeId?: string;       // CLI runtime descriptor id, e.g. claude:/path/to/claude
  endpointId?: string;      // SDK endpoint id
  model?: string;           // provider model id
  modelTier?: 'default' | 'fast' | 'heavy';
  track?: 'auto' | 'cli' | 'sdk' | 'sdk_agent';
  agentProfileId?: string;  // role/profile, e.g. creative-agent
}
```

选择优先级：

```text
draft.selection
  -> conversation selection
  -> scope default (project / area / task)
  -> global defaults (SDK endpoint defaults + runtime registry)
  -> RuntimeRouter.decide()
```

### 3.4 ComposerAttachment

附件不是随 `chat.send_message` 直接传巨大 base64。发送前先 staged 到 main process 的 attachment store，再在 draft 里传 ref。

```ts
type ComposerAttachmentKind =
  | 'image'
  | 'audio'
  | 'pdf'
  | 'document'
  | 'text'
  | 'code'
  | 'archive'
  | 'url'
  | 'unknown';

interface ComposerAttachment {
  id: string;
  conversationId: string;
  kind: ComposerAttachmentKind;
  name: string;
  mimeType?: string;
  size: number;
  sha256: string;
  source: {
    kind: 'file_picker' | 'drag_drop' | 'paste' | 'voice_recording' | 'url' | 'vault_asset';
    originalPath?: string;
    url?: string;
  };
  storage: {
    mode: 'imported' | 'reference';
    relPath?: string;       // .orbit/conversations/attachments/...
    originalPath?: string;  // only when explicitly reference mode
  };
  preview?: {
    thumbnailRelPath?: string;
    textExcerpt?: string;
    durationSec?: number;
    pageCount?: number;
  };
  status: 'staged' | 'attached' | 'failed';
  createdAt: string;
}
```

默认策略：**imported**。用户选中文件后复制到 `.orbit/conversations/attachments/<conversationId>/<attachmentId>/`，避免后续原文件移动导致 conversation 不可回放。

---

## 4. 数据与存储

### 4.1 Conversation store 扩展

`ConversationTurn` 增加 `input` 字段，保留 `content` 兼容旧代码。

```ts
interface ConversationTurn {
  id: string;
  at: string;
  role: ConversationTurnRole;
  content: string;
  input?: ConversationTurnInput;
  runtimeEventIds?: string[];
  artifactRefs?: string[];
  toolTrace?: ToolTraceBlock[];
  replayMessages?: SDKInvocationMessage[];
}

interface ConversationTurnInput {
  text: string;
  attachments?: ComposerAttachmentRef[];
  voice?: ComposerVoiceInput;
  selection?: RuntimeSelection;
  intent?: ComposerIntent;
}
```

`ConversationMeta` 增加更明确的 selection 字段；旧 hints 继续写入一段时间，方便现有 UI 不被打断。

```ts
interface ConversationMeta {
  runtimeSelection?: RuntimeSelection;
  runtimeHint?: string;
  runtimeEndpointHint?: string;
  runtimeModelHint?: string;
}
```

### 4.2 Attachment store

新增 main process service：

```text
src/main/conversation/attachments.ts
src/shared/conversation/attachments.ts
```

落盘结构：

```text
<vault>/.orbit/conversations/
├── index.json
├── <conversationId>.json
└── attachments/
    └── <conversationId>/
        └── <attachmentId>/
            ├── blob
            ├── metadata.json
            └── preview.png
```

IPC：

```ts
window.orbit.chat.attachments.stage(input): Promise<ComposerAttachment>
window.orbit.chat.attachments.remove(id): Promise<void>
window.orbit.chat.attachments.list(conversationId): Promise<ComposerAttachment[]>
window.orbit.chat.attachments.readPreview(id): Promise<AttachmentPreview>
```

Renderer 支持两种来源：

- File picker：优先通过 main process `dialog.showOpenDialog`，拿到路径后由 main 复制，避免大 base64 穿 IPC。
- Drag/drop/paste：renderer 只能拿 `File`/`Blob` 时，走 ArrayBuffer/base64 staging；限制大小，超过阈值提示用 file picker。

### 4.3 安全边界

| 输入来源 | 默认授权 | Agent 可见内容 |
| --- | --- | --- |
| File picker | 用户显式选择，允许 import | attachment store 中的副本 |
| Drag/drop | 用户显式拖入，允许 import | attachment store 中的副本 |
| Paste image/text | 用户显式粘贴，允许 import | attachment store 中的副本或文本 |
| URL | 仅保存 URL；抓取仍需 web tool 策略 | URL 文本，必要时 agent 调 `orbit_web_fetch` |
| 外部路径文本 | 不自动授权 | 继续走 external path approval |
| Vault asset | 已在 vault 范围内 | vault-relative path |

这保证“上传文件”和“让 agent 任意读路径”是两件事。

---

## 5. Runtime / Model / Profile 架构

### 5.1 Runtime catalog 聚合

当前有两类可执行后端：

- Local CLI runtimes：`window.orbit.runtime.list()` 返回 `RuntimeDescriptor[]`
- SDK endpoints：`window.orbit.runtime.sdk.snapshot()` 返回 `SDKEndpointView[]`

Composer 不应该直接拼这两个 API。新增 renderer hook：

```ts
function useRuntimeCatalog(scope: ConversationScope): RuntimeCatalog
```

输出统一 options：

```ts
interface RuntimeCatalog {
  runtimes: ComposerRuntimeOption[];
  modelsByRuntime: Record<string, ComposerModelOption[]>;
  profiles: ComposerProfileOption[];
  defaults: RuntimeSelection;
  capabilityMatrix: Record<string, ComposerCapabilities>;
}
```

`Creative Agent` 这类 UI 标签应是 **agent profile**，不是 runtime。Profile 决定 system prompt / tool exposure / output style；runtime 决定执行后端；model 决定模型。

### 5.2 Capability gating

扩展 runtime descriptor 和 SDK endpoint view 的能力字段：

```ts
interface ComposerCapabilities {
  canSendText: boolean;
  canAttachFiles: boolean;
  canAttachImages: boolean;
  canAttachAudio: boolean;
  canTranscribeAudio: boolean;
  canUseTools: boolean;
  canRunAgentLoop: boolean;
  maxAttachmentBytes?: number;
  acceptedMimeTypes?: string[];
}
```

发送前校验：

1. 用户选择的 runtime/model 原生支持该附件 → 原生传入。
2. 不支持原生附件，但可作为文本/文件引用 → 转成 attachment manifest 注入 prompt。
3. 都不支持 → 禁用发送并提示“当前 runtime 不支持这些附件，请切换模型或移除附件”。

### 5.3 RuntimeRouter 扩展

`RuntimeRouteInput` 增加：

```ts
interface RuntimeRouteInput {
  mode: RuntimeRouteMode;
  runtimeId?: string;
  endpointHint?: string;
  modelHint?: string;
  modelTier?: RuntimeRouteModelTier;
  trackHint?: 'auto' | 'cli' | 'sdk' | 'sdk_agent';
  agentProfileId?: string;
  requiredCapabilities?: Array<
    'text' | 'image_input' | 'file_input' | 'audio_input' | 'tools' | 'agent_loop'
  >;
}
```

Route decision 不再只看 mode，而是看能力需求：

```text
text only + SDK endpoint configured -> sdk
tool use / agent profile -> sdk_agent if endpoint supports tools, otherwise CLI agent
task execution -> CLI runtime by default
image input -> SDK multimodal if supported, otherwise prompt manifest fallback
audio input -> transcribe first or attach manifest; do not silently drop audio
```

---

## 6. Chat 协议升级

### 6.1 ChatAction 兼容升级

保留 action kind `chat.send_message`，但 payload 扩展：

```ts
interface ChatSendMessagePayload {
  text: string;                // legacy and quick access
  draft?: ComposerDraft;       // new canonical payload
}
```

Host 处理规则：

```ts
const draft = payload.draft ?? legacyTextToDraft(payload.text)
```

这样可以渐进迁移所有旧调用。

### 6.2 RuntimeEvent 扩展

为了让 UI 显示“正在读取附件 / 正在转写语音 / 已采用模型 X”，新增事件类型：

```ts
'runtime.input_prepared'
'runtime.attachment_processed'
'runtime.transcription'
'runtime.route_selected'
```

这些事件对 ChatView 是展示信息，对 orchestrator 是审计线索。

---

## 7. Orchestrator 处理流程

Ask Anywhere send 流程从 `send(conversationId, text)` 升级为：

```ts
send(conversationId, draft): Promise<{ runId: string }>
```

处理步骤：

1. 校验 conversation 和并发哨兵。
2. 验证 draft attachments 属于该 conversation 且 status 可用。
3. 根据 draft.selection 更新 `ConversationMeta.runtimeSelection` 和 legacy hints。
4. 调用 `RuntimeRouter.decide()`，传入 required capabilities。
5. append user turn，内容为 text，input 保存完整 draft。
6. 生成 `PreparedInput`：
   - text
   - scoped Orbit context
   - attachment manifest
   - optional extracted text / preview captions / transcription
7. 根据 route 执行：
   - SDK text：转成 SDK messages
   - SDK multimodal：转成 provider content blocks
   - SDK agent：把 attachment manifest 放入 agent loop messages，必要时注册 attachment read tool
   - CLI runtime：把 attachment manifest 和 imported file paths 写入 prompt，明确哪些是用户显式上传
8. RuntimeEvent 流式回 UI。
9. assistant turn 落库，保留 replay messages / tool trace / attachment references。

---

## 8. UI 设计

目标视觉参考来自用户给的示意图，但 Orbit 需要更工作台化、中文化：

```text
┌──────────────────────────────────────────────────────────────┐
│ [模型: GPT-5.2 ▼] [Profile: Creative Agent ▼]        [设置] │
│ ┌ attachment strip ────────────────────────────────────────┐ │
│ │ [image.png ×] [doc.pdf ×] [voice 00:12 ×]                │ │
│ └──────────────────────────────────────────────────────────┘ │
│  输入文本区域                                                │
│                                                              │
│ [+] [工具/意图] [资源/网页]                 [录音] [发送]    │
└──────────────────────────────────────────────────────────────┘
```

控件语义：

| 控件 | 行为 |
| --- | --- |
| 模型 chip | 打开 model menu；显示当前 model 或 “自动” |
| Profile chip | 打开 profile menu；例如 Creative Agent / Research Agent / Executor |
| Runtime menu | 可放在模型菜单的二级分组，也可通过设置按钮进入 |
| `+` | file picker / paste hint / add URL |
| 灯泡 | intent suggestions / prompt transform |
| 望远镜/地球 | web/search intent 或 scoped resource selector |
| 靶心 | scope/context selector（项目、资源、当前页） |
| 麦克风 | 按住或点击录音；录完作为 voice attachment，可选择转写 |
| 发送 | 提交 `ComposerDraft` |

所有 UI 文案默认中文；模型名、runtime 名、provider 名保留英文。

---

## 9. 迁移范围

优先替换这些位置：

1. `components/chat/ChatView.tsx`：用 `AIComposer` 替换 `InputArea`。
2. `components/ask-anywhere/AskAnywherePopover.tsx`：底部输入栏改为 `AIComposer density="floating"`。
3. `views/AskAnywhereView.tsx`：full page 使用同一 `AIComposer`。
4. `components/Tasks/TaskChatHost.tsx` / `TaskConversationTab.tsx`：任务 chat 使用同一 Draft 协议。
5. `components/inbox/InboxChatHost.tsx`：Inbox 审批 chat 使用同一输入，但 capability 可禁用附件。
6. `components/Sidebar/SidebarAskPanel.tsx`：侧栏 Ask 使用 compact density。

旧 `InputArea.tsx` 在全量迁移后删除。

---

## 10. 实施计划

### Phase A — Contracts + catalog

- 新增 shared types：`ComposerDraft`, `RuntimeSelection`, `ComposerAttachment`。
- 扩展 `ChatSendMessagePayload`，保持 `text` 兼容。
- 新增 renderer `useRuntimeCatalog`，聚合 runtime list + SDK endpoints。
- 给 `ConversationMeta` 增加 `runtimeSelection`。

验收：

- 旧 `chat.send_message({ text })` 仍然工作。
- Composer 能显示当前 runtime/model/profile，但先只读。

### Phase B — Text-only AIComposer 替换

- 实现 `AIComposer` 组件，先支持纯文本 + runtime/model/profile chip。
- `ChatView` 使用 `AIComposer` 替代 `InputArea`。
- Ask floating composer 改为复用 `AIComposer density="floating"`。

验收：

- 所有现有 chat surface 文本发送行为不回退。
- 选中的 model/profile 能持久化到 conversation meta。

### Phase C — Runtime/model 真路由

- 扩展 `RuntimeRouter.decide()`。
- `AskAnywhereOrchestrator.send()` 接收 draft selection。
- model/runtime 选择真正影响 SDK endpoint / modelHint / CLI runtime。

验收：

- 切换 SDK endpoint/model 后，runtime status bar 和 RuntimeEvent 中显示一致。
- 切换回自动后使用默认路由。

### Phase D — Attachment store + file/image upload

- 新增 attachment IPC 和 store。
- `AIComposer` 支持 file picker、drag/drop、paste image。
- Orchestrator 将 attachment manifest 注入 prompt。
- SDK 支持的图片输入走原生 content blocks；不支持时走 manifest fallback。

验收：

- 发送图片/文件后，conversation turn 可回放附件。
- 删除原始文件不影响 conversation 中的 imported attachment。
- 大文件和不支持 MIME 有清晰提示。

### Phase E — Voice input

- 把 Quick Capture 的 MediaRecorder 逻辑抽为 `useVoiceRecorder`。
- 录音产物进入 attachment store。
- 新增可选 transcription pipeline：
  - 浏览器可用时先用本地 Web Speech API（如果环境支持）。
  - 否则走未来 speech-capable SDK endpoint。
  - 无转写能力时仍可作为 audio attachment 发送或保存。

验收：

- 用户可录音、预览时长、删除、提交。
- 支持的 runtime 能收到 transcript；不支持 audio 时 UI 明确说明。

### Phase F — Full migration + cleanup

- 替换 Task / Inbox / Sidebar Ask。
- 删除旧 `InputArea` 或保留为 thin wrapper。
- 补齐 e2e 和视觉截图验证。

---

## 11. 测试策略

| 层级 | 测试 |
| --- | --- |
| shared contracts | `ChatSendMessagePayload` legacy/new payload parse |
| main attachment store | staging、hash、metadata、remove、size limit |
| runtime router | selection precedence、capability gating、fallback |
| orchestrator | draft append turn、selection persist、attachment manifest injection |
| renderer unit | `AIComposer` submit、file strip、model menu、disabled states |
| e2e | Ask full page / floating / task chat 发送纯文本不回退 |
| visual | desktop/mobile-ish 宽度下 composer 文本不溢出、不遮挡 |

---

## 12. 风险与开放问题

1. **模型列表时效性**：不要硬编码最新模型名。CLI runtime model options 只能作为默认候选；SDK endpoint 应允许用户输入自定义 model id。
2. **CLI runtime 多模态能力不稳定**：不同 CLI 对文件/图片参数支持不同。第一版用 attachment manifest 保守兜底。
3. **附件体积与隐私**：默认 import 会复制文件，占用磁盘；reference 模式节省空间但可能失效。先默认 import，未来给 per-file 选择。
4. **语音转写 provider**：当前 Quick Capture 只有录音，没有真正 STT。Composer 架构先把 audio attachment 打通，转写作为能力矩阵渐进接入。
5. **Profile 与 Runtime 的边界**：`Creative Agent` 应是 profile，不是 runtime。Profile 改 prompt / tool exposure；runtime 改执行后端。UI 必须避免混淆。
6. **所有 chat surface 统一后权限更复杂**：Inbox 审批 chat、Task chat、Ask Anywhere 的可用工具不同，`AIComposer` 只能展示 controls，最终 authority 仍由 host/orchestrator 决定。

---

## 13. 推荐决策

1. **采用一个共享 `AIComposer`，不要继续扩展 `InputArea`。**
2. **`chat.send_message` 保持 action kind 不变，payload 兼容升级。**
3. **附件先落到 conversation attachment store，再提交 draft ref。**
4. **模型/runtime/profile 三者分离：Model 是模型，Runtime 是执行后端，Profile 是 agent 行为配置。**
5. **先做到 text-only parity，再接入真正附件和语音。**

这条路径能让当前悬浮输入框、Ask full page、Task chat、Inbox chat 都逐步吃到同一套能力，同时避免一次性重写 runtime 和所有聊天界面。
