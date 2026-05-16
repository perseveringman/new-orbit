import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RuntimeSessionAgentFilter,
  RuntimeSessionBridgeStatus,
  RuntimeSessionDetail,
  RuntimeSessionDisplaySettings,
  RuntimeSessionGroups,
  RuntimeSessionListItem,
  RuntimeSessionMessage,
  RuntimeSessionToolCall
} from '@shared/runtime-sessions';

const SESSION_REFRESH_INTERVAL_MS = 15_000;

const DEFAULT_SESSION_GROUPS: RuntimeSessionGroups = {
  claude: [],
  'claude-internal': [],
  amp: [],
  copilot: [],
  codebuddy: [],
  box: [],
  codex: [],
  total: 0
};

const DEFAULT_DISPLAY_SETTINGS: RuntimeSessionDisplaySettings = {
  showUser: true,
  showAssistant: true,
  showThinking: true,
  showToolCalls: true,
  showToolResults: true
};

const DISPLAY_LABELS: Record<keyof RuntimeSessionDisplaySettings, string> = {
  showUser: '用户消息',
  showAssistant: '助手回复',
  showThinking: '思考过程',
  showToolCalls: '工具调用',
  showToolResults: '工具结果'
};

const AGENT_TABS: Array<{ key: RuntimeSessionAgentFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'claude', label: 'Claude Code' },
  { key: 'claude-internal', label: 'Claude Internal' },
  { key: 'amp', label: 'Amp' },
  { key: 'copilot', label: 'Copilot CLI' },
  { key: 'codebuddy', label: 'CodeBuddy' },
  { key: 'box', label: 'Box' },
  { key: 'codex', label: 'Codex' }
];

const STORAGE_KEY = 'orbit-runtime-session-display-settings';

export function RuntimeSessionsView(): JSX.Element {
  const [sessions, setSessions] = useState<RuntimeSessionGroups>(DEFAULT_SESSION_GROUPS);
  const [status, setStatus] = useState<RuntimeSessionBridgeStatus | null>(null);
  const [activeAgent, setActiveAgent] = useState<RuntimeSessionAgentFilter>('all');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionAgent, setActiveSessionAgent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSession, setCurrentSession] = useState<RuntimeSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' } | null>(null);
  const [displaySettings, setDisplaySettings] = useState<RuntimeSessionDisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  const loadSessions = useCallback(async (refresh = false) => {
    try {
      const [nextStatus, nextSessions] = await Promise.all([
        window.orbit.runtimeSessions.status(),
        window.orbit.runtimeSessions.list(refresh)
      ]);
      setStatus(nextStatus);
      setSessions(nextSessions);
    } catch (error) {
      setStatus({
        available: false,
        root: '',
        modulePath: '',
        message: (error as Error).message
      });
      showToast('会话库加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, ...JSON.parse(raw) });
      } catch {
        setDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = async (force = false): Promise<void> => {
      if (!mounted) return;
      await loadSessions(force);
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(true), SESSION_REFRESH_INTERVAL_MS);
    const onFocus = (): void => {
      void refresh(true);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [loadSessions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('runtime-session-search-input')?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const updateSetting = useCallback((key: keyof RuntimeSessionDisplaySettings, value: boolean) => {
    setDisplaySettings((current) => {
      const next = { ...current, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
  }, []);

  const loadSession = useCallback(async (agent: string, id: string) => {
    setActiveSessionId(id);
    setActiveSessionAgent(agent);
    setSessionLoading(true);
    try {
      const session = await window.orbit.runtimeSessions.get(agent, id);
      setCurrentSession(session);
      if (!session) showToast('没有找到这条会话', 'error');
    } catch (error) {
      setCurrentSession(null);
      showToast(`会话加载失败：${(error as Error).message}`, 'error');
    } finally {
      setSessionLoading(false);
    }
  }, [showToast]);

  const handleSessionClick = useCallback((agent: string, id: string) => {
    void loadSession(agent, id);
    if (window.innerWidth <= 768) setSidebarOpen(false);
  }, [loadSession]);

  const copyMarkdown = useCallback(async () => {
    if (!activeSessionAgent || !activeSessionId) return;
    try {
      const result = await window.orbit.runtimeSessions.markdown(activeSessionAgent, activeSessionId, displaySettings);
      await navigator.clipboard.writeText(result.text);
      showToast('已复制 Markdown');
    } catch (error) {
      showToast(`复制失败：${(error as Error).message}`, 'error');
    }
  }, [activeSessionAgent, activeSessionId, displaySettings, showToast]);

  const exportMarkdown = useCallback(async () => {
    if (!activeSessionAgent || !activeSessionId) return;
    try {
      const result = await window.orbit.runtimeSessions.markdown(activeSessionAgent, activeSessionId, displaySettings);
      const blob = new Blob([result.text], { type: 'text/markdown' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast('Markdown 已导出');
    } catch (error) {
      showToast(`导出失败：${(error as Error).message}`, 'error');
    }
  }, [activeSessionAgent, activeSessionId, displaySettings, showToast]);

  const filteredSessions = useMemo(
    () => getFilteredSessions(sessions, activeAgent, searchQuery),
    [sessions, activeAgent, searchQuery]
  );

  return (
    <div className="runtime-session-page">
      <RuntimeSessionSidebar
        sessions={filteredSessions}
        loading={loading}
        activeSessionId={activeSessionId}
        activeSessionAgent={activeSessionAgent}
        activeAgent={activeAgent}
        searchQuery={searchQuery}
        sidebarOpen={sidebarOpen}
        onTabChange={setActiveAgent}
        onSearchChange={setSearchQuery}
        onSessionClick={handleSessionClick}
        onToggle={() => setSidebarOpen((open) => !open)}
        onClose={() => setSidebarOpen(false)}
        onRefresh={() => void loadSessions(true)}
      />

      <main className="runtime-session-main" id="runtime-session-main">
        {status && !status.available ? (
          <RuntimeSessionBridgeError status={status} />
        ) : !currentSession && !sessionLoading ? (
          <RuntimeSessionEmptyState total={sessions.total} />
        ) : null}

        {sessionLoading && !currentSession ? (
          <div className="runtime-session-loading">
            <div className="runtime-session-spinner large" aria-hidden="true" />
            <p>正在加载会话…</p>
          </div>
        ) : null}

        {currentSession ? (
          <RuntimeSessionDetailView
            session={currentSession}
            loading={sessionLoading}
            displaySettings={displaySettings}
            onCopyMarkdown={copyMarkdown}
            onExportMarkdown={exportMarkdown}
            onResetSettings={resetSettings}
            onUpdateSetting={updateSetting}
          />
        ) : null}
      </main>

      <button
        className="runtime-session-mobile-menu"
        type="button"
        aria-label="打开会话列表"
        onClick={() => setSidebarOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {toast ? <RuntimeSessionToast message={toast.message} type={toast.type} /> : null}
    </div>
  );
}

function RuntimeSessionSidebar({
  sessions,
  loading,
  activeSessionId,
  activeSessionAgent,
  activeAgent,
  searchQuery,
  sidebarOpen,
  onTabChange,
  onSearchChange,
  onSessionClick,
  onToggle,
  onClose,
  onRefresh
}: {
  sessions: RuntimeSessionListItem[];
  loading: boolean;
  activeSessionId: string | null;
  activeSessionAgent: string | null;
  activeAgent: RuntimeSessionAgentFilter;
  searchQuery: string;
  sidebarOpen: boolean;
  onTabChange(agent: RuntimeSessionAgentFilter): void;
  onSearchChange(query: string): void;
  onSessionClick(agent: string, id: string): void;
  onToggle(): void;
  onClose(): void;
  onRefresh(): void;
}): JSX.Element {
  const sidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent): void => {
      if (
        window.innerWidth <= 768 &&
        sidebarOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [sidebarOpen, onClose]);

  return (
    <aside
      ref={sidebarRef}
      className={`runtime-session-sidebar${sidebarOpen ? ' open' : ''}`}
      role="navigation"
      aria-label="Runtime 会话导航"
    >
      <header className="runtime-session-sidebar-header">
        <h1 className="runtime-session-logo">
          <span className="runtime-session-logo-icon" aria-hidden="true">◈</span>
          <span>AI 会话</span>
        </h1>
        <div className="runtime-session-sidebar-actions">
          <button className="runtime-session-icon-button" type="button" aria-label="刷新会话库" onClick={onRefresh}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M13 8a5 5 0 11-1.46-3.54M13 3.5V7h-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="runtime-session-icon-button sidebar-toggle" type="button" aria-label="收起会话列表" onClick={onToggle}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <div className="runtime-session-agent-tabs" role="tablist" aria-label="Agent 筛选">
        {AGENT_TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            type="button"
            className={`runtime-session-tab${activeAgent === tab.key ? ' active' : ''}`}
            aria-selected={activeAgent === tab.key}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="runtime-session-search-wrap">
        <label htmlFor="runtime-session-search-input" className="runtime-session-sr-only">搜索会话</label>
        <input
          id="runtime-session-search-input"
          type="search"
          placeholder="搜索会话…"
          autoComplete="off"
          spellCheck={false}
          className="runtime-session-search-input"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value.trim())}
        />
      </div>

      <nav className="runtime-session-list" aria-label="会话列表">
        {loading ? (
          <div className="runtime-session-loading-state">
            <div className="runtime-session-spinner" aria-hidden="true" />
            <p>正在加载会话…</p>
          </div>
        ) : null}
        {!loading && sessions.length === 0 ? (
          <div className="runtime-session-loading-state">
            <p>没有找到会话</p>
          </div>
        ) : null}
        {!loading ? sessions.map((session) => (
          <RuntimeSessionItem
            key={`${session.agentParam}-${session.id}`}
            session={session}
            isActive={session.id === activeSessionId && session.agentParam === activeSessionAgent}
            onClick={() => onSessionClick(session.agentParam ?? session.agent, session.id)}
          />
        )) : null}
      </nav>

      <footer className="runtime-session-sidebar-footer">
        <div className="runtime-session-count" aria-live="polite">
          {!loading ? `${sessions.length} 条会话` : null}
        </div>
      </footer>
    </aside>
  );
}

const RuntimeSessionItem = memo(function RuntimeSessionItem({
  session,
  isActive,
  onClick
}: {
  session: RuntimeSessionListItem;
  isActive: boolean;
  onClick(): void;
}): JSX.Element {
  const displayTitle = session.title || session.summary || session.id.split('/').at(-1) || session.id;
  return (
    <button
      className={`runtime-session-item${isActive ? ' active' : ''}`}
      type="button"
      onClick={onClick}
    >
      <div className="runtime-session-item-header">
        <span className={`runtime-session-agent-dot ${agentClass(session.agentParam ?? session.agent)}`} aria-hidden="true" />
        <span className="runtime-session-item-title">{displayTitle}</span>
        <span className="runtime-session-item-time">{formatShortDate(session.timestamp)}</span>
      </div>
      {session.summary && session.summary !== displayTitle ? (
        <span className="runtime-session-item-summary">{session.summary}</span>
      ) : null}
      {session.projectName ? (
        <span className="runtime-session-item-project">{session.projectName}</span>
      ) : null}
    </button>
  );
});

function RuntimeSessionDetailView({
  session,
  loading,
  displaySettings,
  onCopyMarkdown,
  onExportMarkdown,
  onResetSettings,
  onUpdateSetting
}: {
  session: RuntimeSessionDetail;
  loading: boolean;
  displaySettings: RuntimeSessionDisplaySettings;
  onCopyMarkdown(): void;
  onExportMarkdown(): void;
  onResetSettings(): void;
  onUpdateSetting(key: keyof RuntimeSessionDisplaySettings, value: boolean): void;
}): JSX.Element {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const firstModel = session.messages.find((message) => message.model)?.model || '';
  const visibleMessages = useMemo(
    () => session.messages.filter((message) => messageVisible(message, displaySettings)),
    [session.messages, displaySettings]
  );

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = 0;
  }, [session.id]);

  const label = agentLabel(session.agent);
  return (
    <div className="runtime-session-detail" style={loading ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <header className="runtime-session-header">
        <div className="runtime-session-meta">
          <span className={`runtime-session-agent-badge ${label.className}`}>{label.label}</span>
          <time dateTime={session.timestamp || ''}>{formatFullDate(session.timestamp)}</time>
          {firstModel ? <span className="runtime-session-model">{firstModel}</span> : null}
        </div>
        <h2 className="runtime-session-title">{session.title || session.summary || session.id}</h2>
        <div className="runtime-session-actions">
          <RuntimeSessionDisplaySettingsButton
            settings={displaySettings}
            onReset={onResetSettings}
            onUpdate={onUpdateSetting}
          />
          <button className="runtime-session-btn secondary" type="button" onClick={onExportMarkdown}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 11l6 3 6-3M2 8l6 3 6-3M2 5l6 3 6-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            导出 .md
          </button>
          <button className="runtime-session-btn secondary" type="button" onClick={onCopyMarkdown}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            复制
          </button>
        </div>
      </header>

      <div ref={messagesRef} className="runtime-session-messages" role="log" aria-label="会话消息">
        {visibleMessages.length === 0 ? (
          <div className="runtime-session-messages-empty">
            <p>所有内容类型都已隐藏。</p>
            <button type="button" className="runtime-session-btn secondary" onClick={onResetSettings}>重置显示设置</button>
          </div>
        ) : null}
        {visibleMessages.map((message, index) => (
          <RuntimeSessionMessageCard key={`${index}:${message.timestamp ?? ''}`} message={message} settings={displaySettings} />
        ))}
      </div>
    </div>
  );
}

function RuntimeSessionDisplaySettingsButton({
  settings,
  onUpdate,
  onReset
}: {
  settings: RuntimeSessionDisplaySettings;
  onUpdate(key: keyof RuntimeSessionDisplaySettings, value: boolean): void;
  onReset(): void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const hiddenCount = Object.values(settings).filter((value) => !value).length;
  return (
    <div className="runtime-session-display-settings">
      <button
        className="runtime-session-btn secondary"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 1v2M8 13v2M15 8h-2M3 8H1M12.95 3.05l-1.41 1.41M4.46 11.54l-1.41 1.41M12.95 12.95l-1.41-1.41M4.46 4.46L3.05 3.05" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        显示
        {hiddenCount > 0 ? <span className="runtime-session-display-badge">{hiddenCount}</span> : null}
      </button>
      {open ? (
        <div className="runtime-session-display-panel" role="dialog" aria-label="显示设置">
          <div className="runtime-session-display-panel-header">
            <strong>显示 / 隐藏内容</strong>
            <button type="button" onClick={onReset}>重置</button>
          </div>
          <p>会同时影响浏览器、复制和 Markdown 导出。</p>
          <ul>
            {(Object.keys(DISPLAY_LABELS) as Array<keyof RuntimeSessionDisplaySettings>).map((key) => (
              <li key={key}>
                <label>
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(event) => onUpdate(key, event.currentTarget.checked)}
                  />
                  <span>{DISPLAY_LABELS[key]}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const RuntimeSessionMessageCard = memo(function RuntimeSessionMessageCard({
  message,
  settings
}: {
  message: RuntimeSessionMessage;
  settings: RuntimeSessionDisplaySettings;
}): JSX.Element | null {
  const showAssistant = settings.showAssistant !== false;
  const showUser = settings.showUser !== false;
  const showThinking = settings.showThinking !== false;
  const showToolCalls = settings.showToolCalls !== false;
  const showToolResults = settings.showToolResults !== false;
  const roleLabel = message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Assistant' : 'Tool';

  let renderedContent = message.content || '';
  if (message.role === 'assistant' && renderedContent) {
    const { thinking, text } = splitThinkingFromContent(renderedContent);
    const parts: string[] = [];
    if (thinking && showThinking) {
      const quoted = thinking.split('\n').map((line) => line ? `> ${line}` : '>').join('\n');
      parts.push(`> Thinking\n${quoted}`);
    }
    if (text && showAssistant) parts.push(text);
    renderedContent = parts.join('\n\n');
  } else if (message.role === 'user' && !showUser) {
    renderedContent = '';
  }

  let bodyHtml = renderedContent ? renderMarkdown(renderedContent) : '';
  if (message.type === 'tool_use' && message.toolName) {
    if (!showToolCalls) return null;
    bodyHtml += `<p><strong>Tool:</strong> <code>${escapeHtml(message.toolName)}</code></p>`;
    if (message.toolInput) bodyHtml += `<pre><code>${escapeHtml(JSON.stringify(message.toolInput, null, 2))}</code></pre>`;
  }
  if (message.type === 'tool_result' && message.toolOutput) {
    if (!showToolResults) return null;
    const output = toolOutputToString(message.toolOutput);
    bodyHtml += `<pre><code>${escapeHtml(output)}</code></pre>`;
  }

  const visibleToolCalls = showToolCalls && message.toolCalls ? message.toolCalls : [];
  if (!bodyHtml.trim() && visibleToolCalls.length === 0) return null;

  return (
    <div className={`runtime-session-message ${roleClass(message.role)}`}>
      <div className="runtime-session-message-header">
        <span className="runtime-session-message-role">{roleLabel}</span>
        <span className="runtime-session-message-time">{formatTime(message.timestamp)}</span>
      </div>
      <div className="runtime-session-message-body">
        {bodyHtml.trim() ? <div dangerouslySetInnerHTML={{ __html: bodyHtml }} /> : null}
        {visibleToolCalls.length ? (
          <div className="runtime-session-tool-calls">
            {visibleToolCalls.map((toolCall, index) => (
              <RuntimeSessionToolCallView key={`${toolCall.name}:${index}`} toolCall={toolCall} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});

function RuntimeSessionToolCallView({ toolCall }: { toolCall: RuntimeSessionToolCall }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const rawInput = JSON.stringify(toolCall.input ?? {}, null, 2);
  const input = rawInput.length > 3000 ? `${rawInput.slice(0, 3000)}\n... (truncated)` : rawInput;
  return (
    <div className={`runtime-session-tool-call${expanded ? ' expanded' : ''}`}>
      <button
        className="runtime-session-tool-call-header"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="runtime-session-tool-icon">Tool</span>
        <span className="runtime-session-tool-call-name">{toolCall.name}</span>
      </button>
      <div className="runtime-session-tool-call-body">
        <pre>{input}</pre>
      </div>
    </div>
  );
}

function RuntimeSessionEmptyState({ total }: { total: number }): JSX.Element {
  return (
    <div className="runtime-session-empty">
      <div className="runtime-session-empty-icon" aria-hidden="true">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <rect x="8" y="12" width="48" height="40" rx="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
          <path d="M20 28h24M20 36h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        </svg>
      </div>
      <h2>选择一个会话来查看</h2>
      <p className="runtime-session-empty-hint">
        当前扫描到 {total} 条 runtime 历史会话。使用 <kbd>⌘</kbd><kbd>K</kbd> 可以快速搜索。
      </p>
    </div>
  );
}

function RuntimeSessionBridgeError({ status }: { status: RuntimeSessionBridgeStatus }): JSX.Element {
  return (
    <div className="runtime-session-empty">
      <h2>会话查看器不可用</h2>
      <p className="runtime-session-empty-hint">
        Orbit 当前通过 ai-session-to-md 读取 runtime 会话。请确认路径存在：{status.modulePath}
      </p>
    </div>
  );
}

function RuntimeSessionToast({ message, type = 'success' }: { message: string; type?: 'success' | 'error' }): JSX.Element {
  return <div className={`runtime-session-toast ${type}`} aria-live="polite">{message}</div>;
}

function getFilteredSessions(
  sessions: RuntimeSessionGroups,
  activeAgent: RuntimeSessionAgentFilter,
  searchQuery: string
): RuntimeSessionListItem[] {
  let list: RuntimeSessionListItem[] = [];
  if (activeAgent === 'all' || activeAgent === 'claude') {
    list.push(...sessions.claude.map((session) => ({ ...session, agent: 'claude', agentParam: 'claude' as const })));
  }
  if (activeAgent === 'all' || activeAgent === 'claude-internal') {
    list.push(...sessions['claude-internal'].map((session) => ({ ...session, agent: 'claude-internal', agentParam: 'claude-internal' as const })));
  }
  if (activeAgent === 'all' || activeAgent === 'amp') {
    list.push(...sessions.amp.map((session) => ({ ...session, agent: 'amp', agentParam: 'amp' as const })));
  }
  if (activeAgent === 'all' || activeAgent === 'copilot') {
    list.push(...sessions.copilot.map((session) => ({ ...session, agent: 'copilot', agentParam: 'copilot' as const })));
  }
  if (activeAgent === 'all' || activeAgent === 'codebuddy') {
    list.push(...sessions.codebuddy.map((session) => ({ ...session, agent: 'codebuddy', agentParam: 'codebuddy' as const })));
  }
  if (activeAgent === 'all' || activeAgent === 'box') {
    list.push(...sessions.box.map((session) => ({ ...session, agent: 'box', agentParam: 'box' as const })));
  }
  if (activeAgent === 'all' || activeAgent === 'codex') {
    list.push(...sessions.codex.map((session) => ({ ...session, agent: 'codex', agentParam: 'codex' as const })));
  }
  list.sort((left, right) => getSessionSortTime(right) - getSessionSortTime(left));
  const needle = searchQuery.toLowerCase();
  if (needle) {
    list = list.filter((session) =>
      (session.summary || '').toLowerCase().includes(needle) ||
      (session.title || '').toLowerCase().includes(needle) ||
      (session.projectName || '').toLowerCase().includes(needle) ||
      session.id.toLowerCase().includes(needle)
    );
  }
  return list;
}

function messageVisible(message: RuntimeSessionMessage, settings: RuntimeSessionDisplaySettings): boolean {
  if (message.role === 'user') return settings.showUser !== false;
  if (message.role === 'assistant') {
    if (settings.showAssistant === false) return Boolean(settings.showToolCalls !== false && message.toolCalls?.length);
    return true;
  }
  if (message.role === 'tool') return settings.showToolResults !== false;
  return true;
}

function renderMarkdown(text: string): string {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) =>
    `<pre><code class="language-${lang}">${code}</code></pre>`
  );
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/^(?!<[a-z/])((?:(?!<[a-z/]).+\n?)+)/gm, (match) => `<p>${match.trim()}</p>`);
  return html.replace(/<p>\s*<\/p>/g, '');
}

function splitThinkingFromContent(content: string): { thinking: string; text: string } {
  const thinkingLines: string[] = [];
  const textLines: string[] = [];
  let inThinking = false;
  for (const line of content.split('\n')) {
    if (line.startsWith('> 💭 *Thinking:*') || line.startsWith('> 💭 *Thinking*')) {
      inThinking = true;
      continue;
    }
    if (inThinking) {
      if (line.startsWith('> ')) thinkingLines.push(line.slice(2));
      else if (line === '>') thinkingLines.push('');
      else {
        inThinking = false;
        if (line.trim()) textLines.push(line);
      }
    } else {
      textLines.push(line);
    }
  }
  return {
    thinking: thinkingLines.join('\n').trim(),
    text: textLines.join('\n').trim()
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toolOutputToString(value: unknown): string {
  if (value && typeof value === 'object' && 'output' in value) {
    const output = (value as { output?: unknown }).output;
    return typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  }
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function agentLabel(agent: string): { label: string; className: string } {
  switch (agent) {
    case 'claude-code':
    case 'claude':
      return { label: 'Claude Code', className: 'claude' };
    case 'claude-internal':
      return { label: 'Claude Internal', className: 'claude-internal' };
    case 'amp':
      return { label: 'Amp', className: 'amp' };
    case 'copilot':
      return { label: 'GitHub Copilot CLI', className: 'copilot' };
    case 'codebuddy':
      return { label: 'CodeBuddy', className: 'codebuddy' };
    case 'box':
      return { label: 'Box', className: 'box' };
    case 'codex':
      return { label: 'Codex', className: 'codex' };
    default:
      return { label: agent, className: agentClass(agent) };
  }
}

function agentClass(agent: string): string {
  return agent === 'claude-code' ? 'claude' : agent.replace(/[^a-z0-9-]/giu, '-').toLowerCase();
}

function roleClass(role: string): string {
  if (role === 'user' || role === 'assistant' || role === 'tool') return role;
  return 'assistant';
}

function getSessionSortTime(session: RuntimeSessionListItem): number {
  const value = session.sortTimestamp || session.timestamp;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function formatShortDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  if (diff < 86_400_000) return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
  if (diff < 604_800_000) return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function formatFullDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}
