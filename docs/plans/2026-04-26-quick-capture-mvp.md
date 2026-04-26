---
status: completed
created: 2026-04-26
updated: 2026-04-26
adr: ADR-004, ADR-010
---

# Quick Capture MVP — Thought-only 最小版

> 本期最小能力：全局快捷键 + 轻量浮层 + 只支持创建 Thought。目的是跑通 Capture → Inbox → 后续处理的全流程。Library / Feed 的 Quick Capture 入口下期迭代。

---

## Scope

- 全局快捷键 `⌘⇧I` 打开浮层
- 浮层 UI：内容输入框 + tags + 保存/取消
- 保存后进 Inbox `capture/thoughts/pending.ndjson`
- 在 Inbox Thoughts tab 可见

**不做**：
- Library / Feed 的 Quick Capture 入口
- Voice Log 录音
- 剪贴板自动识别
- 手机 share
- 浏览器插件

---

## 用户体验

### 触发

全局快捷键 `⌘⇧I`（可在 Settings 自定义）：
- Orbit 应用在前台：直接打开浮层
- Orbit 在后台 / 其他应用：先唤起 Orbit + 打开浮层

### 浮层 UI

简约居中的浮窗，250×200 左右：

```
┌───────────────────────────────┐
│ Quick Capture            ⌘⇧I  │
├───────────────────────────────┤
│                                │
│  [文本输入区（autofocus）]      │
│  支持 Markdown                  │
│                                │
├───────────────────────────────┤
│ tags: [  ]                     │
│                                │
│  [取消]           [保存到 Inbox]│
└───────────────────────────────┘
```

- 自动聚焦输入区
- `⌘Enter` 保存
- `Esc` 取消
- tags 是以逗号分隔的 input（简化处理，不做 tag picker）

### 保存后

- 浮层消失，返回用户原本在做的事
- 通知 toast：`Thought saved to Inbox`
- 不强制打开 Inbox（避免打断）

---

## 实施

### 组件

```
src/renderer/src/components/quick-capture/
├── QuickCaptureProvider.tsx  # 全局 keyboard listener
└── QuickCaptureModal.tsx
```

### 全局快捷键

在 `src/main/index.ts` 中用 `globalShortcut.register`:

```typescript
import { globalShortcut, BrowserWindow } from 'electron'

function registerGlobalShortcut(win: BrowserWindow): void {
  globalShortcut.register('CmdOrCtrl+Shift+I', () => {
    if (!win.isVisible()) win.show()
    if (win.isMinimized()) win.restore()
    win.focus()
    win.webContents.send('quick-capture:open')
  })
}
```

Renderer 订阅 `quick-capture:open` 事件，打开 Modal。

### 保存逻辑

```typescript
async function saveQuickCapture(content: string, tags: string[]): Promise<void> {
  await window.api.invoke('capture:createThought', {
    content,
    tags,
    createdFrom: 'quick_capture',
  })
}
```

Main process handler 调用 CaptureStore，最终写入 `inbox/capture/thoughts/pending.ndjson`，并 emit Activity `thought.created`。

### IPC channel

```typescript
// src/main/capture/thought.ts
ipcMain.handle('capture:createThought', async (_, input: CreateThoughtInput) => {
  const thought = await thoughtStore.create(input)
  emitActivity({
    actor: 'user',
    action: 'thought.created',
    context: { thought_id: thought.id, inbox_item_id: thought.id },
    summary: `Thought: ${truncate(input.content, 80)}`,
  })
  return thought
})
```

---

## CLI 等价命令（AI-Native）

```bash
orbit thought create [--content-file F] [--tags a,b]
```

Agent 也可以用这个命令创建 Thought，见 `capture-foundation.md` 的"开放问题"：agent 主动创建 Thought 不走 propose-approve。

---

## 与 Inbox 的衔接

### 列表展示

Inbox → Capture tab → Thoughts 子 tab：

- 时间倒序
- 每条：前 100 字预览 + tags + 时间
- 点击进入右侧 StageView，渲染 `ThoughtRenderer`

### ThoughtRenderer 基础能力

- Markdown 编辑器（复用现有 CodeMirror 配置）
- tags 可编辑
- 底部 action bar：
  - "Promote to Resource"（调 agent 生成 Resource，见 `capture-foundation.md`）
  - "Link to Project"（选 project，写入 project README 的 Inspiration 段）
  - "Propose to Task"（预填 `propose_new_task` 表单）
  - "Dismiss"

---

## 测试

- `tests/quick_capture_shortcut.test.ts` — 全局快捷键注册
- `tests/quick_capture_save.test.ts` — 保存到 inbox
- `e2e/quick_capture_flow.spec.ts` — 快捷键 → 输入 → 保存 → Inbox 可见

---

## 风险

### 快捷键冲突

`⌘⇧I` 可能与其他应用冲突。

**缓解**：
- Settings 中暴露自定义快捷键
- 注册失败时静默提示用户

### 浮层在全屏应用下

macOS 下应用在全屏模式，浮层弹出可能被遮挡。

**缓解**：
- 用 `always-on-top` + `level: 'floating'` 确保最上层
- 依然有些场景（真正的 fullscreen kiosk app）会失效，文档注明

### 用户输入丢失

用户写了一段但 Esc 掉 → 内容丢失。

**缓解**：
- 本期不做 draft 保留（简化）
- 但 Esc 时弹确认 "Discard unsaved content?"

---

## 后续扩展（下期）

- **Library 入口**：浮层切到 "Save URL" → 粘贴 URL → 后台抓取 → 存 Library
- **Feed 入口**：浮层切到 "Add Subscription" → 粘贴 RSS URL → 加订阅源
- **剪贴板识别**：打开浮层时检测剪贴板内容 → URL 自动切到 Library，长文本切到 Thought
- **Voice Log**：按住某键录音 → Whisper 转写 → 存 Thought
- **手机 share endpoint**：本地 HTTP server + 手机 iOS Share Sheet 配置

---

## 验收

- [ ] `⌘⇧I` 全局触发浮层（在任何应用前台都行）
- [ ] 浮层能输入内容 + tags，`⌘Enter` 保存
- [ ] 保存成功后：浮层消失 + toast + Inbox Capture → Thoughts 可见条目
- [ ] Activity Log 有 `thought.created` 事件
- [ ] 点击 Inbox Thought 条目，右侧能编辑和处理
- [ ] CLI `orbit thought create` 行为一致
