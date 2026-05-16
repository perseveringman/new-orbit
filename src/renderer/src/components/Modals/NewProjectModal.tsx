import { useEffect, useMemo, useState } from 'react';
import type { EntitySummary } from '@shared/schemas';
import type { ProjectSummaryDTO, ProjectWorkdirProbeDTO, TemplateMetaDTO } from '@shared/ipc';
import { NewProjectForm, isValidSlug, slugify } from '../../schemas/newProject';
import { useFiles } from '../../store/files';
import { useWorkspace } from '../../store/workspace';

interface Props {
  open: boolean;
  onClose(): void;
  onCreated?(result: { uid: string; slug: string; readmePath: string }): void;
}

const overlay = 'fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm';
const panel =
  'w-[min(560px,92vw)] rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900';
const btn =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800';
const btnPrimary =
  'rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40';
const input =
  'w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-sky-500 dark:border-neutral-700 dark:bg-neutral-900';

export function NewProjectModal({ open, onClose, onCreated }: Props): JSX.Element | null {
  const toast = useFiles((s) => s.toast);
  const openPath = useFiles((s) => s.openPath);
  const refreshProjects = useWorkspace((s) => s.refreshProjects);
  const setActiveProjectUid = useWorkspace((s) => s.setActiveProjectUid);

  const [step, setStep] = useState<1 | 2>(1);
  const [creationMode, setCreationMode] = useState<
    'link-existing' | 'scaffold-new' | 'github-import'
  >('link-existing');
  const [name, setName] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [workdirPath, setWorkdirPath] = useState('');
  const [workdirProbe, setWorkdirProbe] = useState<ProjectWorkdirProbeDTO | null>(null);
  const [parentDir, setParentDir] = useState('');
  const [githubParentDir, setGithubParentDir] = useState('');
  const [githubOwner, setGithubOwner] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [agentExposureMode, setAgentExposureMode] = useState<'isolated' | 'bridge' | 'compatible'>(
    'isolated'
  );
  const [templates, setTemplates] = useState<TemplateMetaDTO[]>([]);
  const [template, setTemplate] = useState('blank');
  const [areas, setAreas] = useState<EntitySummary[]>([]);
  const [areaUid, setAreaUid] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [existingSlugs, setExistingSlugs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setCreationMode('link-existing');
    setName('');
    setSlug('');
    setSlugTouched(false);
    setDescription('');
    setWorkdirPath('');
    setWorkdirProbe(null);
    setParentDir('');
    setGithubParentDir('');
    setGithubOwner('');
    setGithubRepo('');
    setAgentExposureMode('isolated');
    setTemplate('blank');
    setAreaUid('');
    setTags([]);
    setTagInput('');
    setErr(null);
    void (async () => {
      try {
        const [t, projects, ents] = await Promise.all([
          window.orbit.project.listTemplates(),
          window.orbit.project.list(),
          window.orbit.para.listEntities({ type: 'area' })
        ]);
        setTemplates(t);
        if (t.length && !t.find((x) => x.id === template)) setTemplate(t[0]!.id);
        setExistingSlugs((projects as ProjectSummaryDTO[]).map((p) => p.slug));
        setAreas(ents);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-derive slug from name unless user edited it
  useEffect(() => {
    if (creationMode === 'github-import' && githubRepo.trim() && !slugTouched) {
      setSlug(slugify(githubRepo));
      return;
    }
    if (!slugTouched) setSlug(slugify(name));
  }, [creationMode, githubRepo, name, slugTouched]);

  const slugValid = isValidSlug(slug);
  const slugConflict = useMemo(() => existingSlugs.includes(slug), [existingSlugs, slug]);
  const githubTargetDir = githubParentDir
    ? joinPath(githubParentDir, slug || githubRepo.trim())
    : '';

  const canNext =
    creationMode === 'github-import'
      ? githubOwner.trim().length > 0 &&
        githubRepo.trim().length > 0 &&
        githubParentDir.trim().length > 0 &&
        slugValid &&
        !slugConflict
      : creationMode === 'link-existing'
        ? name.trim().length > 0 &&
          workdirPath.trim().length > 0 &&
          workdirProbe?.exists === true &&
          workdirProbe?.isDirectory === true &&
          slugValid &&
          !slugConflict
        : name.trim().length > 0 &&
          parentDir.trim().length > 0 &&
          slugValid &&
          !slugConflict &&
          !!template;
  const canCreate = canNext;

  async function submit(): Promise<void> {
    if (!canCreate) return;
    setBusy(true);
    setErr(null);
    try {
      const effectiveName =
        creationMode === 'github-import' ? name.trim() || githubRepo.trim() : name.trim();
      const parsed = NewProjectForm.parse({
        name: effectiveName,
        description: description.trim(),
        template,
        slug,
        area_uid: areaUid || undefined,
        tags: tags.length ? tags : undefined,
        agent_exposure_mode: agentExposureMode
      });
      const res =
        creationMode === 'github-import'
          ? await window.orbit.github.importRepository({
              owner: githubOwner.trim(),
              repo: githubRepo.trim(),
              slug: parsed.slug,
              name: parsed.name || githubRepo.trim(),
              targetDir: githubTargetDir,
              agent_exposure: { mode: agentExposureMode }
            })
          : creationMode === 'link-existing'
            ? await window.orbit.project.linkExisting({
                slug: parsed.slug,
                name: parsed.name,
                workdirPath,
                description: parsed.description,
                ...(parsed.area_uid ? { area_uid: parsed.area_uid } : {}),
                ...(parsed.tags ? { tags: parsed.tags } : {}),
                execution_context: workdirProbe?.recommendedExecutionContext ?? 'worktree',
                vendor_bridge_files: parsed.agent_exposure_mode !== 'isolated'
              })
            : await window.orbit.project.scaffoldNew({
                slug: parsed.slug,
                template: parsed.template,
                name: parsed.name,
                parentDir,
                dirName: parsed.slug,
                description: parsed.description,
                initializeGit: true,
                ...(parsed.area_uid ? { area_uid: parsed.area_uid } : {}),
                ...(parsed.tags ? { tags: parsed.tags } : {}),
                execution_context: 'worktree',
                vendor_bridge_files: parsed.agent_exposure_mode !== 'isolated'
              });
      await refreshProjects();
      setActiveProjectUid(res.uid);
      toast(
        creationMode === 'github-import'
          ? `已导入 ${githubOwner}/${githubRepo} → ${res.slug}`
          : creationMode === 'link-existing'
            ? `已关联项目 ${res.slug}`
            : `已创建项目 ${res.slug}`
      );
      // Open README for instant editing (R3 will route to Project Room)
      const readmePath = `${res.projectPath}/README.md`;
      try {
        await openPath(readmePath);
      } catch {
        /* best-effort */
      }
      onCreated?.({ uid: res.uid, slug: res.slug, readmePath });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addTag(): void {
    const t = tagInput.trim().replace(/,+$/g, '');
    if (!t) return;
    if (tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput('');
  }

  async function chooseExistingWorkdir(): Promise<void> {
    const picked = await window.orbit.project.chooseDirectory();
    if (picked.canceled || !picked.path) return;
    setWorkdirPath(picked.path);
    const probe = await window.orbit.project.probeWorkdir(picked.path);
    setWorkdirProbe(probe);
    if (!name.trim()) setName(basename(picked.path));
  }

  async function chooseParentDir(target: 'scaffold' | 'github'): Promise<void> {
    const picked = await window.orbit.project.chooseDirectory();
    if (picked.canceled || !picked.path) return;
    if (target === 'scaffold') setParentDir(picked.path);
    else setGithubParentDir(picked.path);
  }

  if (!open) return null;

  return (
    <div className={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={panel} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h2 className="text-sm font-semibold">新建项目 — 第 {step} / 2 步</h2>
          <button className={btn} onClick={onClose} disabled={busy}>
            ✕
          </button>
        </header>

        <div className="space-y-3 px-4 py-4 text-sm">
          {step === 1 && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">来源</span>
                <select
                  className={input}
                  value={creationMode}
                  onChange={(e) =>
                    setCreationMode(
                      e.target.value as 'link-existing' | 'scaffold-new' | 'github-import'
                    )
                  }
                >
                  <option value="link-existing">关联已有代码目录</option>
                  <option value="scaffold-new">创建新的代码目录</option>
                  <option value="github-import">从 GitHub 仓库导入</option>
                </select>
              </label>
              {creationMode === 'github-import' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-500">
                        GitHub Owner / 组织
                      </span>
                      <input
                        className={input}
                        value={githubOwner}
                        onChange={(e) => setGithubOwner(e.target.value)}
                        placeholder="例如 vercel"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-500">仓库</span>
                      <input
                        className={input}
                        value={githubRepo}
                        onChange={(e) => setGithubRepo(e.target.value)}
                        placeholder="例如 next.js"
                      />
                    </label>
                  </div>
                  <PathPicker
                    label="克隆父目录"
                    value={githubParentDir}
                    buttonLabel="选择"
                    onChoose={() => void chooseParentDir('github')}
                  />
                </>
              ) : creationMode === 'link-existing' ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">名称</span>
                    <input
                      className={input}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="例如：Orbit 文档站点"
                      autoFocus
                    />
                  </label>
                  <PathPicker
                    label="已有 Workdir"
                    value={workdirPath}
                    buttonLabel="选择"
                    onChoose={() => void chooseExistingWorkdir()}
                  />
                  {workdirProbe && (
                    <p className="text-[11px] text-neutral-500">
                      {workdirProbe.exists && workdirProbe.isDirectory
                        ? workdirProbe.git?.is_repo
                          ? `检测到 Git 仓库 · ${workdirProbe.recommendedExecutionContext}`
                          : `检测到目录 · ${workdirProbe.recommendedExecutionContext}`
                        : '目录不可读。'}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">名称</span>
                    <input
                      className={input}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="例如：Orbit 文档站点"
                      autoFocus
                    />
                  </label>
                  <PathPicker
                    label="Workdir 父目录"
                    value={parentDir}
                    buttonLabel="选择"
                    onChoose={() => void chooseParentDir('scaffold')}
                  />
                </>
              )}
              {creationMode === 'github-import' && (
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-500">项目名称</span>
                  <input
                    className={input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="可选的显示名称覆盖"
                  />
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">Agent 暴露方式</span>
                <select
                  className={input}
                  value={agentExposureMode}
                  onChange={(e) =>
                    setAgentExposureMode(e.target.value as 'isolated' | 'bridge' | 'compatible')
                  }
                >
                  <option value="isolated">Orbit 隔离（仅 .orbit）</option>
                  <option value="bridge">安全时桥接根目录文件</option>
                  <option value="compatible">桥接并消费社区 Agent 文件</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  路径标识 <span className="text-neutral-400">（根据名称自动生成，可编辑）</span>
                </span>
                <input
                  className={
                    input +
                    ' ' +
                    (!slugValid || slugConflict ? 'border-red-500 dark:border-red-500' : '')
                  }
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugTouched(true);
                  }}
                  placeholder="kebab-case-slug"
                />
                {slug && !slugValid && (
                  <p className="mt-1 text-[11px] text-red-500">
                    必须是小写 kebab-case ASCII，1–64 个字符，且不能包含 `--`。
                  </p>
                )}
                {slugValid && slugConflict && (
                  <p className="mt-1 text-[11px] text-red-500">已有项目使用这个 slug。</p>
                )}
              </label>
              {creationMode === 'link-existing' && (
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-500">描述</span>
                  <textarea
                    className={input + ' min-h-[88px] resize-y'}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="简短项目说明。Orbit 会将它保存在协调 README 中。"
                  />
                </label>
              )}
              {creationMode === 'scaffold-new' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">描述</span>
                    <textarea
                      className={input + ' min-h-[88px] resize-y'}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="一句话或更长说明，会写入新 Workdir 的 README。"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">模板</span>
                    <select
                      className={input}
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                    >
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label} — {t.description}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">Area（可选）</span>
                <select
                  className={input}
                  value={areaUid}
                  onChange={(e) => setAreaUid(e.target.value)}
                >
                  <option value="">— 无 —</option>
                  {areas.map((a) => (
                    <option key={a.uid} value={a.uid}>
                      {a.title} ({a.relPath})
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="mb-1 block text-xs text-neutral-500">标签</span>
                <div className="flex flex-wrap items-center gap-1">
                  {tags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-red-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-red-900/50"
                      title="点击移除"
                    >
                      #{t} ✕
                    </button>
                  ))}
                  <input
                    className="min-w-[120px] flex-1 rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-sky-500 dark:border-neutral-700"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTag();
                      } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                        setTags(tags.slice(0, -1));
                      }
                    }}
                    placeholder="输入后按 Enter"
                  />
                </div>
              </div>
              <div className="rounded border border-dashed border-neutral-300 p-3 text-xs text-neutral-500 dark:border-neutral-700">
                <div>
                  <b>路径标识：</b> {slug}
                </div>
                <div>
                  <b>来源：</b>{' '}
                  {creationMode === 'github-import'
                    ? `${githubOwner || 'owner'}/${githubRepo || 'repo'}`
                    : creationMode === 'link-existing'
                      ? '已关联 Workdir'
                      : `template:${template}`}
                </div>
                <div>
                  <b>协调目录：</b> 01_Projects/{slug}/
                </div>
                <div className="truncate">
                  <b>工作目录：</b>{' '}
                  {creationMode === 'github-import'
                    ? githubTargetDir || '请选择克隆父目录'
                    : creationMode === 'link-existing'
                      ? workdirPath || '请选择已有目录'
                      : parentDir
                        ? joinPath(parentDir, slug)
                        : '请选择父目录'}
                </div>
                <div>
                  <b>暴露方式：</b> {agentExposureMode}
                </div>
              </div>
            </>
          )}
          {err && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-600 dark:text-red-300">
              {err}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <button className={btn} onClick={onClose} disabled={busy}>
            取消
          </button>
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button className={btn} onClick={() => setStep(1)} disabled={busy}>
                ← 返回
              </button>
            )}
            {step === 1 ? (
              <button className={btnPrimary} onClick={() => setStep(2)} disabled={!canNext || busy}>
                下一步 →
              </button>
            ) : (
              <button className={btnPrimary} onClick={submit} disabled={!canCreate || busy}>
                {busy
                  ? creationMode === 'github-import'
                    ? '导入中…'
                    : creationMode === 'link-existing'
                      ? '关联中…'
                      : '创建中…'
                  : creationMode === 'github-import'
                    ? '导入项目'
                    : creationMode === 'link-existing'
                      ? '关联项目'
                      : '创建项目'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function PathPicker({
  label,
  value,
  buttonLabel,
  onChoose
}: {
  label: string;
  value: string;
  buttonLabel: string;
  onChoose(): void;
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-500">{label}</span>
      <div className="flex gap-2">
        <input
          className={input + ' font-mono text-xs'}
          value={value}
          onChange={() => undefined}
          placeholder="未选择目录"
          readOnly
        />
        <button className={btn} type="button" onClick={onChoose}>
          {buttonLabel}
        </button>
      </div>
    </label>
  );
}

function basename(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? value;
}

function joinPath(parent: string, child: string): string {
  if (!parent) return child;
  return `${parent.replace(/[\\/]+$/g, '')}/${child}`;
}
