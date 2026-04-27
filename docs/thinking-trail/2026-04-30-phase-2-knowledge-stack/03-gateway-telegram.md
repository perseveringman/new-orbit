# 文档 3：Gateway Daemon + Telegram Channel

> **规模**：L（约 3~4 天 AI 实施，含 Telegram Bot 调试）
> **依赖**：Phase 1 Ask-Anywhere 完成；defaults runtime 可用
> **产物**：独立 Gateway daemon + Telegram Bot + Orbit App 与 Gateway 的 IPC 协议

---

## 1. 设计哲学

### 1.1 问题陈述

Orbit 目前是一个 Electron 桌面 App。用户出门、在手机上、或 App 没开时：
1. 想快速记一下 capture
2. 想问 Ask-Anywhere 一个问题
3. 想收到定时任务的提醒 / 今日总结推送
4. 想转发一篇文章到 Library

**无法**。只能等回家开电脑。

### 1.2 Gateway 抽象（参考 openclaw）

引入 **Gateway Daemon**——一个独立运行的后台进程（不依赖 Orbit App 界面），充当：
- **多渠道网关**（Telegram / WhatsApp / WeChat / Email / SMS / Web Push）
- **Orbit App 的代表**（App 不开时也能响应）
- **外部触发入口**（webhook / shortcuts / siri）

```
   ┌──────────────┐       ┌──────────────┐      ┌──────────────┐
   │  Telegram    │──────→│              │←────→│  Ask-Anywhere│
   │  WhatsApp    │──────→│   Gateway    │      │  Runtime     │
   │  Email       │──────→│   Daemon     │      └──────────────┘
   │  Webhook     │──────→│              │      ┌──────────────┐
   │  Shortcuts   │──────→│   (Node.js)  │←────→│  Orbit App   │
   └──────────────┘       └──────────────┘      │  (Electron)  │
                              ↑      ↓           └──────────────┘
                              │   Vault File IO
                              └────→ 直接读写 vault（Orbit App 没开也能工作）
```

### 1.3 本 Phase 范围

**做**：
- Gateway Daemon 核心（启动 / 停止 / channel 抽象）
- Telegram Channel（完整）
- Orbit App ↔ Gateway 的通信协议
- 基础管理 UI（在 Orbit 里配置 Telegram Token、绑定用户）

**不做**（预留扩展点）：
- WhatsApp / WeChat / Email / SMS / Webhook 其他渠道
- Gateway 的集群 / 云端托管（只做本地守护进程）
- 端到端加密（本地通信默认不加密，但协议预留 `signature` 字段）

---

## 2. 架构

### 2.1 进程结构

```
┌─────────────────────────────────────────────────────────────────┐
│  Orbit 应用集群（用户机器）                                       │
│                                                                 │
│  ┌──────────────────┐         ┌──────────────────┐             │
│  │  Orbit App       │  IPC    │  Gateway Daemon   │             │
│  │  (Electron)      │←───────→│  (Node.js)        │             │
│  │                  │         │                   │             │
│  │  - UI            │         │  - Channel 管理   │             │
│  │  - 主控面板       │         │  - Telegram Bot   │             │
│  │  - 配置          │         │  - Routing        │             │
│  └──────────────────┘         │  - 直接 vault I/O │             │
│                               └──────────────────┘             │
│                                    ↑      ↓                     │
│                                    │      ↓                     │
│                                    │  Vault (磁盘文件)            │
│                                    │                             │
│                                    ↓                             │
│                                 外部网络                          │
│                                    ↓                             │
│  ┌───────────────────────────────────────────────────────┐      │
│  │  Telegram API  /  WhatsApp API  /  Email SMTP  ...    │      │
│  └───────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 进程职责边界

| 职责 | Orbit App | Gateway Daemon |
|------|----------|----------------|
| 渲染 UI | ✅ | ❌ |
| 用户交互 | ✅ | ❌ |
| Channel 连接（TG/WA/...） | ❌ | ✅ |
| Ask-Anywhere 调用 | ✅（来自 App 用户）| ✅（来自远程渠道）|
| 写 Note / Library | ✅ | ✅（代替用户）|
| 读 vault | ✅ | ✅ |
| 定时任务触发 | ❌（交给系统 scheduler）| ✅（监听 cron/系统 scheduler 回调）|
| 推送通知到 channel | ❌ | ✅ |

**设计原则**：两边都能直接读写 vault（以文件系统为真相源），但 App 和 Daemon 之间也需要 IPC 通信来协同（避免并发冲突 + 推消息）。

### 2.3 Gateway 生命周期

- **启动**：Orbit App 启动时检查 daemon 是否在，不在则 spawn（`node gateway/index.js`）
- **独立运行**：Orbit App 关闭时 daemon **继续运行**（用户可选）
- **停止**：用户在 UI 里显式停止，或系统关机
- **崩溃恢复**：daemon 注册为 launchd / systemd service（可选，高阶）

### 2.4 通信协议

**Orbit App ↔ Gateway**：Unix Domain Socket + JSON-RPC 2.0

```
socket path: ~/.orbit/gateway.sock (macOS/Linux)
             \\.\pipe\orbit-gateway (Windows)
```

消息格式（JSON-RPC 2.0）：
```json
// App → Gateway
{ "jsonrpc": "2.0", "id": "1", "method": "channel.list", "params": {} }

// Gateway → App（响应）
{ "jsonrpc": "2.0", "id": "1", "result": [{ "id": "tg-main", "kind": "telegram", "status": "connected" }] }

// Gateway → App（push 通知）
{ "jsonrpc": "2.0", "method": "channel.message_received", 
  "params": { "channel": "tg-main", "from": "user-123", "text": "记一下..." } }
```

---

## 3. Channel 抽象

### 3.1 接口定义

```typescript
// gateway/src/channels/types.ts

export interface IChannel {
  id: string;
  kind: ChannelKind;                // 'telegram' | 'whatsapp' | 'email' | ...
  name: string;
  
  // 生命周期
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): ChannelStatus;
  
  // 发送
  send(message: ChannelOutboundMessage): Promise<void>;
  
  // 接收（事件驱动）
  on(event: 'message', handler: (msg: ChannelInboundMessage) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
  on(event: 'status', handler: (status: ChannelStatus) => void): void;
  
  // 配置
  getConfig(): ChannelConfig;
  updateConfig(patch: Partial<ChannelConfig>): Promise<void>;
}

export type ChannelKind = 
  | 'telegram'
  | 'whatsapp'
  | 'email'
  | 'sms'
  | 'webhook'
  | 'wechat';

export type ChannelStatus = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface ChannelInboundMessage {
  channel_id: string;
  from: {
    id: string;                     // 渠道内的用户 id（如 TG user id）
    name?: string;
    identity_verified?: boolean;    // 是否已绑定到 Orbit user
  };
  kind: 'text' | 'image' | 'audio' | 'file' | 'url' | 'forward';
  content: any;                     // 具体结构见下文
  timestamp: string;
  raw?: any;                        // 原始载荷（调试用）
}

export interface ChannelOutboundMessage {
  channel_id: string;
  to: string;                       // 渠道内的用户 id
  kind: 'text' | 'image' | 'file' | 'link_card';
  content: any;
}
```

### 3.2 Telegram Channel 实现

```typescript
// gateway/src/channels/telegram.ts

import { Telegraf } from 'telegraf';   // 用 telegraf 库

export class TelegramChannel implements IChannel {
  kind = 'telegram' as const;
  private bot: Telegraf;
  private config: TelegramChannelConfig;
  private emitter = new EventEmitter();
  
  constructor(config: TelegramChannelConfig) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.bot = new Telegraf(config.bot_token);
    this.setupHandlers();
  }
  
  private setupHandlers() {
    // 文本消息
    this.bot.on('text', (ctx) => {
      const from_id = ctx.from.id.toString();
      if (!this.isAuthorized(from_id)) {
        ctx.reply('你还没有绑定到 Orbit 账号。请在 Orbit 应用的 Gateway 设置里获取绑定码。');
        return;
      }
      this.emitter.emit('message', {
        channel_id: this.id,
        from: { id: from_id, name: ctx.from.first_name, identity_verified: true },
        kind: 'text',
        content: { text: ctx.message.text },
        timestamp: new Date().toISOString(),
        raw: ctx.message,
      });
    });
    
    // URL 转发 → 自动收藏到 Library
    this.bot.on('message', (ctx) => {
      const msg = ctx.message as any;
      if (msg.entities?.some(e => e.type === 'url')) { /* ... */ }
    });
    
    // 图片
    this.bot.on('photo', (ctx) => { /* ... */ });
    
    // 语音
    this.bot.on('voice', (ctx) => { /* ... */ });
    
    // 文件
    this.bot.on('document', (ctx) => { /* ... */ });
    
    // 命令
    this.bot.command('start', (ctx) => ctx.reply(WELCOME_MSG));
    this.bot.command('bind', (ctx) => this.handleBindCommand(ctx));
    this.bot.command('help', (ctx) => ctx.reply(HELP_MSG));
  }
  
  async start() {
    await this.bot.launch();
    this.emitter.emit('status', 'connected');
  }
  
  async stop() {
    this.bot.stop();
  }
  
  async send(msg: ChannelOutboundMessage) {
    switch (msg.kind) {
      case 'text':
        await this.bot.telegram.sendMessage(msg.to, msg.content.text, {
          parse_mode: 'Markdown',
        });
        break;
      case 'image':
        await this.bot.telegram.sendPhoto(msg.to, msg.content.url);
        break;
      case 'file':
        await this.bot.telegram.sendDocument(msg.to, { source: msg.content.path });
        break;
      case 'link_card':
        // 发带预览的链接
        await this.bot.telegram.sendMessage(msg.to, 
          `*${msg.content.title}*\n${msg.content.description}\n${msg.content.url}`,
          { parse_mode: 'Markdown' });
        break;
    }
  }
  
  // ...
}

interface TelegramChannelConfig {
  id: string;
  name: string;
  bot_token: string;
  authorized_users: Array<{
    tg_user_id: string;
    orbit_user_id: string;
    bound_at: string;
  }>;
}
```

### 3.3 绑定流程（安全）

Telegram 是公开的，任何人知道 Bot 的名字都能 @它。必须绑定机制：

```
┌─ Orbit 应用里 ──────────────────────────┐    
│  设置 → Gateway → Telegram              │
│                                        │
│  生成绑定码: [ABC123]                    │
│  有效期: 10 分钟                         │
│                                        │
│  使用方法：                              │
│  1. 打开 Telegram，搜索 @OrbitBot（你的）│
│  2. 发送: /bind ABC123                  │
│  3. 完成绑定                            │
└────────────────────────────────────────┘
```

绑定码机制：
- Orbit App 生成 6 位随机码，写入 Gateway config: `pending_binds: [{ code, orbit_user_id, expires_at }]`
- TG 用户发 `/bind ABC123` → Gateway 查 code → 匹配成功 → 添加 `authorized_users`
- 绑定成功后 TG 端回复"已绑定"

---

## 4. 消息路由（Telegram → Ask-Anywhere）

### 4.1 路由规则

收到 TG 文本消息时，Gateway 判断意图：

```typescript
// gateway/src/router.ts

async function routeInboundMessage(msg: ChannelInboundMessage) {
  if (msg.kind !== 'text') return routeByKind(msg);
  
  const text = msg.content.text.trim();
  
  // 1. 命令（以 / 开头）
  if (text.startsWith('/')) return handleCommand(text, msg);
  
  // 2. URL → 自动 save to library
  if (isURL(text)) return saveToLibrary(text, msg);
  
  // 3. 快捷记笔记（以 # 开头）
  //    例: "# 想到 Resource 涌现机制应该..."
  if (text.startsWith('#')) return quickCapture(text.slice(1).trim(), msg);
  
  // 4. 默认：丢给 Ask-Anywhere
  return askAnywhere(text, msg);
}
```

### 4.2 Ask-Anywhere 调用

Gateway 有一个**轻量 Ask-Anywhere Runtime 客户端**（不是完整 runtime，而是调用方）：

```typescript
async function askAnywhere(text: string, msg: ChannelInboundMessage) {
  const conversation = await getOrCreateRemoteConversation(msg.from.id);
  
  // 发给 Orbit App（通过 Unix socket JSON-RPC）
  // 如果 App 不在，Gateway 直接调用 runtime 的 CLI 入口
  const response = await invokeAskAnywhere({
    conversation_id: conversation.id,
    user_message: text,
    source: {
      channel: msg.channel_id,
      user: msg.from.id,
    },
  });
  
  // 把响应发回 TG
  await channel.send({
    channel_id: msg.channel_id,
    to: msg.from.id,
    kind: 'text',
    content: { text: response.text },
  });
  
  // 如果产生了产物，追加一条 link 消息
  for (const artifact of response.artifacts ?? []) {
    await channel.send({
      channel_id: msg.channel_id,
      to: msg.from.id,
      kind: 'link_card',
      content: { title: artifact.title, description: artifact.description, url: artifact.deeplink },
    });
  }
}
```

**关键**：Ask-Anywhere 的调用要支持两种模式：
- **App 在线**：Gateway → IPC → App → Ask-Anywhere runtime
- **App 离线**：Gateway 直接 spawn runtime（需要 runtime 有 CLI 入口）

后者复杂度高，**本 Phase 先做 App 在线模式**，App 离线时 Gateway 回复 "Orbit App 未运行，你的消息已记录，打开 App 后我会处理"（并把消息存到 `gateway/inbox.jsonl` 等 App 连上后重放）。

### 4.3 TG 命令清单

```
/start          - 欢迎语
/bind <code>    - 绑定 Orbit 账号
/unbind         - 解绑
/help           - 帮助
/capture <text> - 快速记笔记（等价于 "# text"）
/save <url>     - 保存链接到 Library
/ask <question> - 显式调用 Ask-Anywhere
/today          - 获取今日总结
/inbox          - 查看 Orbit Inbox 未处理项
/scheduled      - 列出定时任务
```

---

## 5. Orbit App 里的 Gateway 管理 UI

### 5.1 位置

设置（Settings）里新增一个 "Gateway" tab，不在左侧栏一级入口（因为不是高频）。

### 5.2 UI 设计

```
┌──────────────────────────────────────────────────────────────────┐
│  Settings > Gateway                                              │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  Gateway 守护进程                                                │
│  状态: ● 运行中 (PID 12345)                                       │
│  启动方式: ⦿ 随 Orbit 启动  ○ 手动                              │
│  Orbit 关闭后: ⦿ 继续运行  ○ 停止                                │
│                                                                  │
│  [停止守护进程]   [重启]   [查看日志]                             │
│                                                                  │
│  ────────────────────────────────────────────────────────────── │
│  Channels                                                        │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ ● Telegram (@OrbitUserBot)                       [编辑]   │   │
│  │   已绑定用户: 1 个                                          │   │
│  │   最近消息: 3 分钟前                                        │   │
│  │   状态: connected                                          │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ ○ WhatsApp                                    [Coming]    │   │
│  │ ○ Email                                       [Coming]    │   │
│  │ ○ Webhook                                     [Coming]    │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [+ 添加 Telegram Bot]                                           │
└──────────────────────────────────────────────────────────────────┘
```

### 5.3 Telegram 配置页

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Gateway   Telegram Bot 配置                                    │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  Bot Token                                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ •••••••••••••••••••••••                     [显示] [编辑]│   │
│  └──────────────────────────────────────────────────────────┘   │
│  获取 Token: https://t.me/BotFather                              │
│                                                                  │
│  Bot 名称: @OrbitUserBot                                         │
│  状态: ● connected                                               │
│                                                                  │
│  ────────────────────────────────────────────────────────────── │
│  已绑定用户                                                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Ryan (@ryanbz)                              [解绑]        │   │
│  │ TG ID: 12345                                              │   │
│  │ 绑定于: 2026-04-30 10:00                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [+ 生成绑定码]                                                   │
│                                                                  │
│  ┌── 生成绑定码 ──────────────────────────────────────────┐     │
│  │  绑定码: ABC123   (有效期 10:00 倒计时)                │     │
│  │                                                        │     │
│  │  使用方式:                                             │     │
│  │  1. Telegram 中打开 @OrbitUserBot                      │     │
│  │  2. 发送: /bind ABC123                                 │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ────────────────────────────────────────────────────────────── │
│  消息路由规则（默认路由可自定义）                                   │
│                                                                  │
│  以 # 开头 → Quick Capture                                       │
│  纯 URL → Save to Library                                        │
│  其他 → Ask-Anywhere                                             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. 数据模型 + 存储

### 6.1 Gateway Config

存储位置：`~/.orbit/gateway/config.json`

```typescript
interface GatewayConfig {
  version: 1;
  daemon: {
    auto_start: boolean;           // 随 Orbit 启动
    keep_running_after_app_close: boolean;
    log_level: 'debug' | 'info' | 'warn' | 'error';
  };
  channels: ChannelConfig[];
  orbit: {
    app_ipc_socket: string;        // socket 路径
    vault_path: string;            // Gateway 直接访问的 vault
  };
  pending_binds: Array<{
    code: string;
    orbit_user_id: string;
    expires_at: string;
  }>;
}

type ChannelConfig = TelegramChannelConfig | /* ... */;
```

### 6.2 Inbox（App 离线时暂存）

`~/.orbit/gateway/offline-inbox.jsonl`，每行一条 `ChannelInboundMessage`。App 连上后重放，处理完的消息移到 `offline-inbox.processed.jsonl`。

---

## 7. IPC 协议细节

### 7.1 Method 列表

| Method | 方向 | 用途 |
|--------|------|------|
| `gateway.status` | App→GW | 查询 daemon 状态 |
| `gateway.shutdown` | App→GW | 请求停止 daemon |
| `channel.list` | App→GW | 列出所有 channel |
| `channel.add` | App→GW | 新增 channel |
| `channel.remove` | App→GW | 删除 |
| `channel.update` | App→GW | 更新配置 |
| `channel.start` / `channel.stop` | App→GW | 控制 channel |
| `channel.send` | App→GW | App 要求 Gateway 推送消息 |
| `channel.generate_bind_code` | App→GW | 生成绑定码 |
| `channel.message_received` | GW→App | 收到入站消息（推送给 App）|
| `channel.status_changed` | GW→App | channel 状态变化 |
| `askAnywhere.invoke` | GW→App | GW 调用 AA |
| `askAnywhere.response` | App→GW | AA 响应 |

---

## 8. 实施步骤

### Step 1: Gateway Daemon 骨架（半天）
1. 新建 `gateway/` 顶层目录（不在 `src/` 下，独立项目）
2. `gateway/package.json`（独立依赖：`telegraf`, `jsonrpc-lite` 等）
3. `gateway/src/index.ts` 启动入口
4. `gateway/src/ipc-server.ts`（Unix socket JSON-RPC 2.0 服务端）
5. `gateway/src/config-store.ts`（config 读写）
6. 启动 + 停止 + 状态查询

### Step 2: Channel 抽象 + 注册表（半天）
1. `gateway/src/channels/types.ts`
2. `gateway/src/channels/registry.ts`
3. `gateway/src/channels/base.ts`（公共逻辑）

### Step 3: Telegram Channel（1 天）
1. `gateway/src/channels/telegram.ts`
2. Bot 初始化 + 消息监听
3. 绑定命令实现
4. URL / 文件 / 语音 handler

### Step 4: 消息路由（半天）
1. `gateway/src/router.ts`
2. 路由规则（命令 / URL / # capture / AA）
3. 直接 vault 写入（capture / save to library 时）

### Step 5: Ask-Anywhere 调用（App 在线模式）（半天）
1. Gateway 通过 IPC 调用 App
2. App 端实现 `askAnywhere.invoke` handler
3. 离线降级（存 offline-inbox）

### Step 6: Orbit App 里的 Gateway 管理 UI（1 天）
1. `src/renderer/views/settings/GatewaySettingsView.tsx`
2. 子页 Telegram 配置
3. 绑定码生成 UI
4. Channel 列表 + 状态

### Step 7: App ↔ Gateway 通信整合（半天）
1. App 端 IPC client
2. App 启动时 spawn daemon（可选）
3. 状态同步（channel status → UI）

### Step 8: 调试 + 端到端测试（半天）
1. 建一个测试 Bot（@BotFather 注册）
2. 端到端跑通：TG 发消息 → Gateway → AA → 回复
3. URL 收藏链路
4. /capture 快捷
5. 绑定流程

**总计：约 4~5 天 AI 实施（含 Telegram 调试时间）**

---

## 9. 验收标准

- [ ] Gateway daemon 能独立启动/停止
- [ ] Orbit App 启动时能自动 spawn daemon（如果配置）
- [ ] Orbit App 关闭后 daemon 继续运行（如果配置）
- [ ] Telegram Channel 能连上 Bot
- [ ] `/bind` 绑定流程工作
- [ ] TG 发文本消息 → Ask-Anywhere 响应回到 TG
- [ ] TG 发 URL → 自动 save 到 Library
- [ ] TG 发 `# 捕获内容` → 创建 thought note
- [ ] 未绑定的 TG 用户被拒绝
- [ ] App 离线时消息被暂存，App 上线后重放
- [ ] Gateway 产生的操作发事件（TraceableEvent 有 `gateway.*` kind）

---

## 10. Future-Proof

- **WhatsApp**：基于 `whatsapp-web.js` 或 Cloud API
- **Email**：IMAP 监听 → 邮件正文当 AA prompt；SMTP 发回
- **Webhook**：HTTP 服务器 + 签名验证
- **WeChat**：itchat 或 wxpy（需谨慎，风控）
- **Siri Shortcuts**：iOS Shortcuts → HTTP POST → Gateway
- **Gateway 云化**：未来可把 Gateway 部署到 VPS（但需要处理 vault 同步，复杂度高，不做）

---

## 11. 安全考虑

- Bot Token 加密存储（用 OS keychain）
- 绑定码短时效（10 分钟）+ 一次性
- 未绑定用户严格拒绝
- Gateway 日志不打印 Bot Token 全文
- 未来 channel 之间的消息路由避免跨用户泄露

---

## 12. 依赖清单

```json
{
  "dependencies": {
    "telegraf": "^4.x",
    "jsonrpc-lite": "^2.x",
    "chokidar": "^3.x"
  }
}
```
