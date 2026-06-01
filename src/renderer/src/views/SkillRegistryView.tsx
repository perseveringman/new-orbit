import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FilePlus2,
  KeyRound,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2
} from 'lucide-react';
import type {
  AgentSkillRegistrySnapshot,
  AgentSkillSaveInput,
  AgentSkillView,
  AgentToolRegistrationView,
  EditableSkillSource,
  SkillStoreDetail,
  SkillStoreItem,
  SkillStoreSearchInput,
  SkillStoreSearchResult
} from '@shared/agent-tools';
import type { ConversationScope } from '@shared/conversation';

type RegistryMode = 'local' | 'store';

type SkillDraft = {
  source: EditableSkillSource;
  originalName?: string;
  name: string;
  description: string;
  scopes: ConversationScope['kind'][];
  tools: string[];
  model: string;
  requiresFiles: string;
  requiresConfig: string;
  requiresEnv: string;
  apiKey: string;
  envConfig: string;
  body: string;
};

const SCOPE_OPTIONS: Array<{ value: ConversationScope['kind']; label: string }> = [
  { value: 'global', label: '全局' },
  { value: 'project', label: '项目' },
  { value: 'area', label: '领域' },
  { value: 'resource', label: '资源' },
  { value: 'note', label: '笔记' },
  { value: 'library', label: '资料库' },
  { value: 'task', label: '任务' },
  { value: 'external', label: '外部入口' }
];

const SOURCE_LABELS: Record<EditableSkillSource, string> = {
  app: '应用级',
  vault: 'Vault 级'
};

const STORE_SORT_OPTIONS: Array<{ value: NonNullable<SkillStoreSearchInput['sortBy']>; label: string }> = [
  { value: 'score', label: '综合' },
  { value: 'downloads', label: '下载' },
  { value: 'stars', label: '收藏' },
  { value: 'installs', label: '安装' },
  { value: 'name', label: '名称' }
];

const FIELD_INPUT_CLASS =
  'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-600';

const EMPTY_DRAFT: SkillDraft = {
  source: 'vault',
  name: '',
  description: '',
  scopes: [],
  tools: [],
  model: '',
  requiresFiles: '',
  requiresConfig: '',
  requiresEnv: '',
  apiKey: '',
  envConfig: '',
  body: ''
};

export function SkillRegistryView(): JSX.Element {
  const [mode, setMode] = useState<RegistryMode>('local');
  const [snapshot, setSnapshot] = useState<AgentSkillRegistrySnapshot | null>(null);
  const [tools, setTools] = useState<AgentToolRegistrationView[]>([]);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | EditableSkillSource>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<SkillDraft>(EMPTY_DRAFT);
  const [storeQuery, setStoreQuery] = useState('');
  const [storeSort, setStoreSort] = useState<NonNullable<SkillStoreSearchInput['sortBy']>>('score');
  const [storeResult, setStoreResult] = useState<SkillStoreSearchResult | null>(null);
  const [storeSelectedSlug, setStoreSelectedSlug] = useState<string | null>(null);
  const [storeDetail, setStoreDetail] = useState<SkillStoreDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeDetailLoading, setStoreDetailLoading] = useState(false);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(nextSelectedKey = selectedKey): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const [skillSnapshot, toolSnapshot] = await Promise.all([
        window.orbit.skills.list(),
        window.orbit.tools.snapshot()
      ]);
      setSnapshot(skillSnapshot);
      setTools(toolSnapshot.active);
      const visible = skillSnapshot.skills;
      const selected =
        (nextSelectedKey ? visible.find((skill) => skillKey(skill) === nextSelectedKey) : null) ??
        visible.find((skill) => skill.effective) ??
        visible[0] ??
        null;
      if (selected) {
        setSelectedKey(skillKey(selected));
        setDraft(draftFromSkill(selected));
      } else {
        setSelectedKey(null);
        setDraft({ ...EMPTY_DRAFT, source: skillSnapshot.sources.vaultDir ? 'vault' : 'app' });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshStore(page = storeResult?.page ?? 1): Promise<void> {
    setStoreLoading(true);
    setError(null);
    try {
      const result = await window.orbit.skills.storeSearch({
        page,
        pageSize: 24,
        sortBy: storeSort,
        order: storeSort === 'name' ? 'asc' : 'desc',
        ...(storeQuery.trim() ? { keyword: storeQuery.trim() } : {})
      });
      setStoreResult(result);
      const nextSlug =
        (storeSelectedSlug && result.items.some((item) => item.slug === storeSelectedSlug)
          ? storeSelectedSlug
          : result.items[0]?.slug) ?? null;
      setStoreSelectedSlug(nextSlug);
      setStoreDetail(null);
      if (nextSlug) await loadStoreDetail(nextSlug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStoreLoading(false);
    }
  }

  async function loadStoreDetail(slug: string): Promise<void> {
    setStoreDetailLoading(true);
    setError(null);
    try {
      const detail = await window.orbit.skills.storeDetail(slug);
      setStoreDetail(detail);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStoreDetailLoading(false);
    }
  }

  function openStore(): void {
    setMode('store');
    if (!storeResult) void refreshStore(1);
  }

  const filteredSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (snapshot?.skills ?? []).filter((skill) => {
      if (sourceFilter !== 'all' && skill.source !== sourceFilter) return false;
      if (!normalized) return true;
      return [skill.name, skill.description, skill.body, skill.path]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalized));
    });
  }, [query, snapshot, sourceFilter]);

  const selectedSkill =
    snapshot?.skills.find((skill) => skillKey(skill) === selectedKey) ?? null;
  const selectedStoreItem =
    storeDetail?.item ??
    storeResult?.items.find((item) => item.slug === storeSelectedSlug) ??
    null;
  const editableTools = useMemo(
    () => tools.filter((tool) => tool.status === 'active').sort((a, b) => a.name.localeCompare(b.name)),
    [tools]
  );

  function selectSkill(skill: AgentSkillView): void {
    setSelectedKey(skillKey(skill));
    setDraft(draftFromSkill(skill));
  }

  function selectStoreSkill(skill: SkillStoreItem): void {
    setStoreSelectedSlug(skill.slug);
    setStoreDetail(null);
    void loadStoreDetail(skill.slug);
  }

  function startNew(source: EditableSkillSource): void {
    setSelectedKey(null);
    setDraft({
      ...EMPTY_DRAFT,
      source,
      body: '在这里写清楚这个 skill 适用的工作流、判断标准和输出偏好。'
    });
  }

  async function saveDraft(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const runtimeConfig = runtimeConfigFromDraft(draft);
      const input: AgentSkillSaveInput = {
        source: draft.source,
        ...(draft.originalName ? { originalName: draft.originalName } : {}),
        name: draft.name.trim(),
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        ...(draft.scopes.length ? { scopes: draft.scopes } : {}),
        ...(draft.tools.length ? { tools: draft.tools } : {}),
        ...(draft.model.trim() ? { model: draft.model.trim() } : {}),
        requires: {
          files: splitLines(draft.requiresFiles),
          config: splitLines(draft.requiresConfig),
          env: splitLines(draft.requiresEnv)
        },
        ...(runtimeConfig ? { runtimeConfig } : {}),
        body: draft.body
      };
      await window.orbit.skills.save(input);
      await refresh(`${input.source}:${input.name}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelected(): Promise<void> {
    if (!selectedSkill || !selectedSkill.editable) return;
    const ok = window.confirm(`删除 skill「${selectedSkill.name}」？`);
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await window.orbit.skills.delete({
        source: selectedSkill.source as EditableSkillSource,
        name: selectedSkill.name
      });
      await refresh(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function installStoreSkill(source: EditableSkillSource): Promise<void> {
    const slug = selectedStoreItem?.slug ?? storeSelectedSlug;
    if (!slug) return;
    setInstallingSlug(slug);
    setError(null);
    try {
      const installed = await window.orbit.skills.storeInstall({ slug, source });
      setMode('local');
      await refresh(skillKey(installed));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInstallingSlug(null);
    }
  }

  const total = snapshot?.skills.length ?? 0;
  const effectiveCount = snapshot?.skills.filter((skill) => skill.effective && !skill.disabledReason).length ?? 0;
  const disabledCount = snapshot?.skills.filter((skill) => skill.disabledReason).length ?? 0;
  const storeItems = storeResult?.items ?? [];
  const storeTotal = storeResult?.total ?? 0;
  const storePage = storeResult?.page ?? 1;
  const storePageSize = storeResult?.pageSize ?? 24;
  const storeMaxPage = Math.max(1, Math.ceil(storeTotal / storePageSize));

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="grid h-full min-h-0 grid-cols-[23rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header className="border-b border-neutral-200 px-5 py-5 dark:border-neutral-800">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
              <Sparkles size={14} />
              随处问技能
            </div>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl font-semibold tracking-normal">技能库</h1>
              <button
                type="button"
                onClick={() => (mode === 'store' ? void refreshStore() : void refresh())}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
                title="刷新"
                aria-label="刷新"
              >
                <RefreshCw size={16} className={loading || storeLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-800 dark:bg-neutral-900">
              <ModeButton active={mode === 'local'} onClick={() => setMode('local')}>
                本地技能
              </ModeButton>
              <ModeButton active={mode === 'store'} onClick={openStore}>
                SkillHub
              </ModeButton>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              {mode === 'store' ? (
                <>
                  <Metric label="收录" value={storeTotal} />
                  <Metric label="当前页" value={storeItems.length} />
                  <Metric label="页码" value={storePage} />
                </>
              ) : (
                <>
                  <Metric label="总数" value={total} />
                  <Metric label="生效" value={effectiveCount} />
                  <Metric label="停用" value={disabledCount} />
                </>
              )}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
              <Search size={15} className="text-neutral-400" />
              <input
                value={mode === 'store' ? storeQuery : query}
                onChange={(event) => (mode === 'store' ? setStoreQuery(event.target.value) : setQuery(event.target.value))}
                onKeyDown={(event) => {
                  if (mode === 'store' && event.key === 'Enter') void refreshStore(1);
                }}
                placeholder={mode === 'store' ? '搜索 SkillHub' : '搜索技能'}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
              />
            </div>
            {mode === 'store' ? (
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <select
                  value={storeSort}
                  onChange={(event) =>
                    setStoreSort(event.target.value as NonNullable<SkillStoreSearchInput['sortBy']>)
                  }
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-700 outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200"
                >
                  {STORE_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      按{option.label}排序
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void refreshStore(1)}
                  className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-900"
                >
                  搜索
                </button>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <SourceFilterButton active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>
                  全部
                </SourceFilterButton>
                <SourceFilterButton active={sourceFilter === 'app'} onClick={() => setSourceFilter('app')}>
                  应用级
                </SourceFilterButton>
                <SourceFilterButton active={sourceFilter === 'vault'} onClick={() => setSourceFilter('vault')}>
                  Vault
                </SourceFilterButton>
              </div>
            )}
          </header>

          <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
            {mode === 'store' ? (
              <button
                type="button"
                onClick={() => void installStoreSkill(snapshot?.sources.vaultDir ? 'vault' : 'app')}
                disabled={!selectedStoreItem || installingSlug === selectedStoreItem.slug}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-neutral-950 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
              >
                {installingSlug === selectedStoreItem?.slug ? (
                  <RefreshCw size={15} className="animate-spin" />
                ) : (
                  <Download size={15} />
                )}
                安装选中技能
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startNew(snapshot?.sources.vaultDir ? 'vault' : 'app')}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-neutral-950 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
              >
                <FilePlus2 size={15} />
                新建技能
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {error ? (
              <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                {error}
              </div>
            ) : null}
            <div className="space-y-2">
              {mode === 'store' ? (
                <>
                  {storeLoading && !storeItems.length ? (
                    <div className="rounded-md border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
                      正在加载 SkillHub...
                    </div>
                  ) : null}
                  {storeItems.map((skill) => {
                    const active = skill.slug === storeSelectedSlug;
                    return (
                      <button
                        key={skill.slug}
                        type="button"
                        onClick={() => selectStoreSkill(skill)}
                        className={[
                          'w-full rounded-md border px-3 py-3 text-left transition',
                          active
                            ? 'border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950'
                            : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700 dark:hover:bg-neutral-900'
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-sm font-semibold">{skill.name}</span>
                          <span
                            className={[
                              'shrink-0 rounded border px-1.5 py-0.5 text-[10px]',
                              active
                                ? 'border-white/30 text-white/80 dark:border-neutral-950/20 dark:text-neutral-700'
                                : 'border-neutral-200 text-neutral-500 dark:border-neutral-800 dark:text-neutral-400'
                            ].join(' ')}
                          >
                            SkillHub
                          </span>
                        </div>
                        <p className={['mt-1 line-clamp-2 text-xs', active ? 'text-white/70 dark:text-neutral-700' : 'text-neutral-500 dark:text-neutral-400'].join(' ')}>
                          {storeDescription(skill)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <TinyBadge active={active}>{formatCompactNumber(skill.downloads)} 下载</TinyBadge>
                          <TinyBadge active={active}>{formatCompactNumber(skill.stars)} 收藏</TinyBadge>
                          {skill.ownerName ? <TinyBadge active={active}>{skill.ownerName}</TinyBadge> : null}
                        </div>
                      </button>
                    );
                  })}
                  {!storeLoading && !storeItems.length ? (
                    <div className="rounded-md border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                      没有匹配的 SkillHub 技能。
                    </div>
                  ) : null}
                  {storeResult ? (
                    <div className="flex items-center justify-between pt-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <button
                        type="button"
                        onClick={() => void refreshStore(Math.max(1, storePage - 1))}
                        disabled={storeLoading || storePage <= 1}
                        className="rounded-md border border-neutral-200 px-2 py-1 disabled:opacity-40 dark:border-neutral-800"
                      >
                        上一页
                      </button>
                      <span>
                        {storePage} / {storeMaxPage}
                      </span>
                      <button
                        type="button"
                        onClick={() => void refreshStore(Math.min(storeMaxPage, storePage + 1))}
                        disabled={storeLoading || storePage >= storeMaxPage}
                        className="rounded-md border border-neutral-200 px-2 py-1 disabled:opacity-40 dark:border-neutral-800"
                      >
                        下一页
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  {filteredSkills.map((skill) => {
                    const active = skillKey(skill) === selectedKey;
                    const status = runtimeStatusOf(skill);
                    const diagnostics = diagnosticsOf(skill);
                    return (
                      <button
                        key={skillKey(skill)}
                        type="button"
                        onClick={() => selectSkill(skill)}
                        className={[
                          'w-full rounded-md border px-3 py-3 text-left transition',
                          active
                            ? 'border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950'
                            : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700 dark:hover:bg-neutral-900'
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-sm font-semibold">{skill.name}</span>
                          <span
                            className={[
                              'shrink-0 rounded border px-1.5 py-0.5 text-[10px]',
                              active
                                ? 'border-white/30 text-white/80 dark:border-neutral-950/20 dark:text-neutral-700'
                                : 'border-neutral-200 text-neutral-500 dark:border-neutral-800 dark:text-neutral-400'
                            ].join(' ')}
                          >
                            {sourceLabel(skill.source)}
                          </span>
                        </div>
                        <p className={['mt-1 line-clamp-2 text-xs', active ? 'text-white/70 dark:text-neutral-700' : 'text-neutral-500 dark:text-neutral-400'].join(' ')}>
                          {skill.description || '未填写描述'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {skill.effective ? <TinyBadge active={active}>生效</TinyBadge> : <TinyBadge active={active}>被覆盖</TinyBadge>}
                          {skill.disabledReason ? <TinyBadge active={active}>未满足条件</TinyBadge> : null}
                          {status.missingEnv.length ? <TinyBadge active={active}>缺密钥</TinyBadge> : null}
                          {diagnostics.missingReferences.length ? <TinyBadge active={active}>缺引用</TinyBadge> : null}
                          {skill.tools.length ? <TinyBadge active={active}>{skill.tools.length} 工具</TinyBadge> : <TinyBadge active={active}>工具全集</TinyBadge>}
                        </div>
                      </button>
                    );
                  })}
                  {!filteredSkills.length ? (
                    <div className="rounded-md border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                      没有匹配的技能。
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto">
          {mode === 'store' ? (
            <div className="mx-auto flex max-w-5xl flex-col gap-5 px-8 py-8">
              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-5 dark:border-neutral-800">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                    SkillHub
                  </div>
                  <h2 className="text-2xl font-semibold tracking-normal">
                    {selectedStoreItem?.name ?? '技能商店'}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-neutral-400">
                    从 skillhub.cn 搜索社区技能，安装后会落成本地 SKILL.md，并进入随处问的多选技能列表。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void installStoreSkill('app')}
                    disabled={!selectedStoreItem || installingSlug === selectedStoreItem.slug}
                    className="inline-flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-900"
                  >
                    <Download size={15} />
                    安装到应用级
                  </button>
                  <button
                    type="button"
                    onClick={() => void installStoreSkill('vault')}
                    disabled={!snapshot?.sources.vaultDir || !selectedStoreItem || installingSlug === selectedStoreItem.slug}
                    className="inline-flex items-center gap-2 rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
                  >
                    {installingSlug === selectedStoreItem?.slug ? (
                      <RefreshCw size={15} className="animate-spin" />
                    ) : (
                      <Download size={15} />
                    )}
                    安装到 Vault
                  </button>
                </div>
              </header>

              {selectedStoreItem ? (
                <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                  <div className="space-y-4">
                    <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-mono text-lg font-semibold">{selectedStoreItem.name}</h3>
                            {selectedStoreItem.version ? <TinyBadge active={false}>v{selectedStoreItem.version}</TinyBadge> : null}
                            {selectedStoreItem.category ? <TinyBadge active={false}>{selectedStoreItem.category}</TinyBadge> : null}
                          </div>
                          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-neutral-400">
                            {storeDescription(selectedStoreItem)}
                          </p>
                        </div>
                        {selectedStoreItem.homepage ? (
                          <a
                            href={selectedStoreItem.homepage}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-900"
                          >
                            <ExternalLink size={14} />
                            主页
                          </a>
                        ) : null}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedStoreItem.tags.slice(0, 10).map((tag) => (
                          <TinyBadge key={tag} active={false}>
                            {tag}
                          </TinyBadge>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
                        <h3 className="text-sm font-semibold">技能内容预览</h3>
                        {storeDetailLoading ? (
                          <RefreshCw size={15} className="animate-spin text-neutral-400" />
                        ) : null}
                      </div>
                      <pre className="max-h-[42rem] overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-xs leading-6 text-neutral-700 dark:text-neutral-300">
                        {storeDetail?.skillMarkdown?.trim() ||
                          storeDetail?.readme?.trim() ||
                          (storeDetailLoading ? '正在加载技能内容...' : '这个技能暂时没有可预览的内容。')}
                      </pre>
                    </section>
                  </div>

                  <aside className="space-y-4">
                    <Panel title="社区数据">
                      <div className="grid grid-cols-2 gap-2">
                        <StoreStat label="下载" value={formatCompactNumber(selectedStoreItem.downloads)} />
                        <StoreStat label="安装" value={formatCompactNumber(selectedStoreItem.installs)} />
                        <StoreStat label="收藏" value={formatCompactNumber(selectedStoreItem.stars)} />
                        <StoreStat label="评分" value={selectedStoreItem.score.toFixed(1)} />
                      </div>
                    </Panel>
                    <Panel title="来源">
                      <div className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                        <StatusLine label="Slug" value={selectedStoreItem.slug} />
                        <StatusLine label="作者" value={selectedStoreItem.ownerName ?? '未知'} />
                        <StatusLine label="来源" value={selectedStoreItem.source ?? 'SkillHub'} />
                        <StatusLine label="更新" value={formatStoreDate(selectedStoreItem.updatedAt)} />
                        <StatusLine label="文件" value={storeDetail?.fileCount ? `${storeDetail.fileCount}` : '未知'} />
                      </div>
                    </Panel>
                    <Panel title="安全">
                      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
                        <ShieldCheck size={14} />
                        {storeDetail?.securityStatus ?? '安装前请查看技能内容'}
                      </div>
                    </Panel>
                    <Panel title="安装位置">
                      <div className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                        <StatusLine label="应用级" value={snapshot?.sources.appDir ?? '可用'} />
                        <StatusLine label="Vault" value={snapshot?.sources.vaultDir ?? '当前未打开 Vault'} />
                      </div>
                    </Panel>
                  </aside>
                </section>
              ) : (
                <div className="rounded-md border border-dashed border-neutral-300 px-6 py-16 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                  搜索或选择一个 SkillHub 技能。
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto flex max-w-5xl flex-col gap-5 px-8 py-8">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-5 dark:border-neutral-800">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                  Skill Frontmatter
                </div>
                <h2 className="text-2xl font-semibold tracking-normal">
                  {draft.originalName ? `编辑 ${draft.originalName}` : '注册新技能'}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-neutral-400">
                  技能会在随处问发送时注入上下文；在输入框中可以选择一个或多个技能。
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedSkill?.editable ? (
                  <button
                    type="button"
                    onClick={() => void deleteSelected()}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-md border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/70 dark:text-rose-200 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 size={15} />
                    删除
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void saveDraft()}
                  disabled={saving || !draft.name.trim()}
                  className="inline-flex items-center gap-2 rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
                >
                  {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                  保存
                </button>
              </div>
            </header>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="名称">
                    <input
                      value={draft.name}
                      onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="research-web"
                      className={`${FIELD_INPUT_CLASS} font-mono`}
                    />
                  </Field>
                  <Field label="来源">
                    <div className="grid grid-cols-2 gap-2">
                      {(['vault', 'app'] as EditableSkillSource[]).map((source) => (
                        <button
                          key={source}
                          type="button"
                          disabled={source === 'vault' && !snapshot?.sources.vaultDir}
                          onClick={() => setDraft((current) => ({ ...current, source }))}
                          className={[
                            'rounded-md border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
                            draft.source === source
                              ? 'border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950'
                              : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-900'
                          ].join(' ')}
                        >
                          {SOURCE_LABELS[source]}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>

                <Field label="描述">
                  <input
                    value={draft.description}
                    onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                    placeholder="这个技能适合处理什么问题"
                    className={FIELD_INPUT_CLASS}
                  />
                </Field>

                <Field label="适用范围">
                  <div className="flex flex-wrap gap-2">
                    {SCOPE_OPTIONS.map((scope) => (
                      <ToggleChip
                        key={scope.value}
                        active={draft.scopes.includes(scope.value)}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            scopes: toggleValue(current.scopes, scope.value)
                          }))
                        }
                      >
                        {scope.label}
                      </ToggleChip>
                    ))}
                    <span className="self-center text-xs text-neutral-400">不选则所有范围生效</span>
                  </div>
                </Field>

                <Field label="模型覆盖">
                  <input
                    value={draft.model}
                    onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                    placeholder="claude-sonnet-4"
                    className={`${FIELD_INPUT_CLASS} font-mono`}
                  />
                </Field>

                <Field label="技能正文">
                  <textarea
                    value={draft.body}
                    onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                    rows={16}
                    className={`${FIELD_INPUT_CLASS} min-h-[22rem] font-mono leading-6`}
                  />
                </Field>
              </div>

              <aside className="space-y-4">
                <Panel title="工具">
                  <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                    {editableTools.map((tool) => (
                      <label
                        key={tool.name}
                        className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-900"
                      >
                        <input
                          type="checkbox"
                          checked={draft.tools.includes(tool.name)}
                          onChange={() =>
                            setDraft((current) => ({
                              ...current,
                              tools: toggleValue(current.tools, tool.name)
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-neutral-800 dark:text-neutral-100">
                            {tool.name}
                          </span>
                          <span className="block truncate text-neutral-500 dark:text-neutral-400">
                            {tool.family} · {tool.risk}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-neutral-400">不选工具表示不限制工具集。</p>
                </Panel>

                <Panel title="启用条件">
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    必需文件
                    <textarea
                      value={draft.requiresFiles}
                      onChange={(event) => setDraft((current) => ({ ...current, requiresFiles: event.target.value }))}
                      rows={4}
                      placeholder="Resources/"
                      className={`${FIELD_INPUT_CLASS} mt-1 font-mono`}
                    />
                  </label>
                  <label className="mt-3 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    必需密钥 / 环境变量
                    <textarea
                      value={draft.requiresEnv}
                      onChange={(event) => setDraft((current) => ({ ...current, requiresEnv: event.target.value }))}
                      rows={3}
                      placeholder="GETNOTE_API_KEY"
                      className={`${FIELD_INPUT_CLASS} mt-1 font-mono`}
                    />
                  </label>
                  <label className="mt-3 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    配置标记
                    <textarea
                      value={draft.requiresConfig}
                      onChange={(event) => setDraft((current) => ({ ...current, requiresConfig: event.target.value }))}
                      rows={4}
                      placeholder="app.features.thoughts.enabled"
                      className={`${FIELD_INPUT_CLASS} mt-1 font-mono`}
                    />
                  </label>
                </Panel>

                <Panel title="密钥">
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                    <KeyRound size={14} className="mt-0.5 shrink-0" />
                    <span>密钥保存在 Orbit 技能配置，不写入 SKILL.md；保存后输入框会清空。</span>
                  </div>
                  <label className="mt-3 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    主 API Key（可选）
                    <input
                      type="password"
                      value={draft.apiKey}
                      onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
                      placeholder="粘贴新的 key"
                      className={`${FIELD_INPUT_CLASS} mt-1 font-mono`}
                    />
                  </label>
                  <label className="mt-3 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    环境变量
                    <textarea
                      value={draft.envConfig}
                      onChange={(event) => setDraft((current) => ({ ...current, envConfig: event.target.value }))}
                      rows={5}
                      placeholder={'GETNOTE_API_KEY=...\nGETNOTE_CLIENT_ID=...'}
                      className={`${FIELD_INPUT_CLASS} mt-1 font-mono`}
                    />
                  </label>
                </Panel>

                <Panel title="状态">
                  <div className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                    <StatusLine label="路径" value={selectedSkill?.path ?? '保存后生成'} />
                    <StatusLine label="覆盖" value={selectedSkill?.effective ? '当前生效' : selectedSkill ? '被高优先级覆盖' : '新建'} />
                    <StatusLine label="条件" value={selectedSkill?.disabledReason ?? '可启用'} />
                    <StatusLine label="必需密钥" value={runtimeStatusOf(selectedSkill).requiredEnv.join(', ') || '无'} />
                    <StatusLine label="已配置" value={runtimeStatusOf(selectedSkill).configuredEnv.join(', ') || (runtimeStatusOf(selectedSkill).apiKeySet ? '主 API Key' : '无')} />
                    <StatusLine label="缺失密钥" value={runtimeStatusOf(selectedSkill).missingEnv.join(', ') || '无'} />
                    <StatusLine label="缺失引用" value={diagnosticsOf(selectedSkill).missingReferences.join(', ') || '无'} />
                    {selectedSkill?.effective && !selectedSkill.disabledReason ? (
                      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
                        <CheckCircle2 size={14} />
                        已进入随处问候选技能
                      </div>
                    ) : null}
                  </div>
                </Panel>
              </aside>
            </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-2 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded px-3 py-1.5 text-xs font-medium transition',
        active
          ? 'bg-white text-neutral-950 shadow-sm dark:bg-neutral-800 dark:text-white'
          : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function StoreStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-neutral-600 dark:text-neutral-300">
        {label}
      </span>
      {children}
    </label>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function SourceFilterButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1 text-xs font-medium transition',
        active
          ? 'border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950'
          : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-900'
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ToggleChip({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1.5 text-xs font-medium transition',
        active
          ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200'
          : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-900'
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function TinyBadge({ active, children }: { active: boolean; children: ReactNode }): JSX.Element {
  return (
    <span
      className={[
        'rounded border px-1.5 py-0.5 text-[10px]',
        active
          ? 'border-white/30 text-white/75 dark:border-neutral-950/20 dark:text-neutral-700'
          : 'border-neutral-200 text-neutral-500 dark:border-neutral-800 dark:text-neutral-400'
      ].join(' ')}
    >
      {children}
    </span>
  );
}

function StatusLine({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <span className="font-medium text-neutral-700 dark:text-neutral-200">{label}: </span>
      <span className="break-all font-mono">{value}</span>
    </div>
  );
}

function skillKey(skill: Pick<AgentSkillView, 'source' | 'name'>): string {
  return `${skill.source}:${skill.name}`;
}

function sourceLabel(source: AgentSkillView['source']): string {
  if (source === 'app') return '应用';
  if (source === 'vault') return 'Vault';
  return 'Space';
}

function runtimeStatusOf(skill: AgentSkillView | null | undefined): AgentSkillView['runtimeStatus'] {
  return (
    skill?.runtimeStatus ?? {
      enabled: true,
      apiKeySet: false,
      requiredEnv: [],
      configuredEnv: [],
      missingEnv: [],
      configKeys: []
    }
  );
}

function diagnosticsOf(skill: AgentSkillView | null | undefined): AgentSkillView['diagnostics'] {
  return skill?.diagnostics ?? { missingReferences: [] };
}

function draftFromSkill(skill: AgentSkillView): SkillDraft {
  return {
    source: skill.source === 'space' ? 'vault' : skill.source,
    originalName: skill.name,
    name: skill.name,
    description: skill.description,
    scopes: skill.scopes,
    tools: skill.tools,
    model: skill.model ?? '',
    requiresFiles: (skill.requires.files ?? []).join('\n'),
    requiresConfig: (skill.requires.config ?? []).join('\n'),
    requiresEnv: (skill.requires.env ?? []).join('\n'),
    apiKey: '',
    envConfig: '',
    body: skill.body
  };
}

function runtimeConfigFromDraft(draft: SkillDraft): AgentSkillSaveInput['runtimeConfig'] | undefined {
  const env = parseEnvAssignments(draft.envConfig);
  const apiKey = draft.apiKey.trim();
  if (!apiKey && Object.keys(env).length === 0) return undefined;
  return {
    ...(apiKey ? { apiKey } : {}),
    ...(Object.keys(env).length ? { env } : {})
  };
}

function parseEnvAssignments(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim().toUpperCase();
    const val = trimmed.slice(index + 1).trim();
    if (/^[A-Z][A-Z0-9_]{1,79}$/.test(key) && val) out[key] = val;
  }
  return out;
}

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function storeDescription(skill: SkillStoreItem): string {
  return skill.descriptionZh || skill.description || '暂无描述';
}

function formatCompactNumber(value: number): string {
  if (value >= 100_000) return `${Math.round(value / 10_000)}万`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return `${value}`;
}

function formatStoreDate(timestamp?: number): string {
  if (!timestamp) return '未知';
  const normalized = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(normalized));
}
