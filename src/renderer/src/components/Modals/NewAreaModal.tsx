import { useEffect, useMemo, useState } from 'react';
import type { CreateAreaResultDTO } from '@shared/ipc';
import { isValidSlug, slugify } from '../../schemas/newProject';
import { useFiles } from '../../store/files';
import { useWorkspace } from '../../store/workspace';
import { usePara } from '../../store/para';

const overlay =
  'fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm';
const panel =
  'w-[min(560px,92vw)] rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900';
const btn =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800';
const btnPrimary =
  'rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40';
const input =
  'w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-sky-500 dark:border-neutral-700 dark:bg-neutral-900';

export function NewAreaModal(): JSX.Element | null {
  const refreshAreas = useWorkspace((s) => s.refreshAreas);
  const setView = usePara((s) => s.setView);
  const toast = useFiles((s) => s.toast);

  const [open, setOpen] = useState(false);
  const [creationMode, setCreationMode] = useState<'local' | 'github-import'>('local');
  const [template, setTemplate] = useState<'blank' | 'vision'>('blank');
  const [name, setName] = useState('');
  const [githubOwner, setGithubOwner] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [existingSlugs, setExistingSlugs] = useState<string[]>([]);

  useEffect(() => {
    function onOpen(): void {
      setOpen(true);
    }
    window.addEventListener('orbit:open-new-area', onOpen);
    return () => window.removeEventListener('orbit:open-new-area', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    setCreationMode('local');
    setTemplate('blank');
    setName('');
    setGithubOwner('');
    setGithubRepo('');
    setSlug('');
    setSlugTouched(false);
    setTagInput('');
    setBusy(false);
    setErr(null);
    void (async () => {
      try {
        const areas = await window.orbit.area.list();
        setExistingSlugs(areas.map((area) => area.slug));
      } catch {
        setExistingSlugs([]);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (slugTouched) return;
    if (creationMode === 'github-import') {
      setSlug(slugify(githubRepo));
      return;
    }
    setSlug(slugify(name));
  }, [creationMode, githubRepo, name, slugTouched]);

  const slugValid = isValidSlug(slug);
  const slugConflict = useMemo(() => existingSlugs.includes(slug), [existingSlugs, slug]);
  const tags = tagInput
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const effectiveName =
    creationMode === 'github-import' ? name.trim() || githubRepo.trim() : name.trim();
  const canCreate =
    effectiveName.length > 0 &&
    slugValid &&
    !slugConflict &&
    (creationMode === 'local' || (githubOwner.trim().length > 0 && githubRepo.trim().length > 0));

  function onClose(): void {
    if (busy) return;
    setOpen(false);
  }

  async function submit(): Promise<void> {
    if (!canCreate) return;
    setBusy(true);
    setErr(null);
    try {
      const result: CreateAreaResultDTO = await window.orbit.area.create({
        name: effectiveName,
        slug,
        template: creationMode === 'local' ? template : 'blank',
        tags: tags.length ? tags : undefined,
        ...(creationMode === 'github-import'
          ? {
              github: {
                owner: githubOwner.trim(),
                repo: githubRepo.trim()
              }
            }
          : {})
      });
      const areas = await refreshAreas();
      const created = areas.find((area) => area.uid === result.uid);
      if (created) {
        setView({ kind: 'areaRoom', areaUid: created.uid });
      }
      toast(
        creationMode === 'github-import'
          ? `已导入 ${githubOwner}/${githubRepo} → ${result.slug}`
          : `已创建 Area ${result.slug}`
      );
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={panel} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h2 className="text-sm font-semibold">新建 Area</h2>
          <button className={btn} onClick={onClose} disabled={busy}>
            ✕
          </button>
        </header>

        <div className="space-y-3 px-4 py-4 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">来源</span>
            <select
              className={input}
              value={creationMode}
              onChange={(e) => setCreationMode(e.target.value as 'local' | 'github-import')}
            >
              <option value="local">创建本地 Area</option>
              <option value="github-import">从 GitHub 仓库导入</option>
            </select>
          </label>

          {creationMode === 'local' ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">模板</span>
                <select
                  className={input}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as 'blank' | 'vision')}
                >
                  <option value="blank">空白 Area</option>
                  <option value="vision">愿景 Area</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">名称</span>
                <input
                  className={input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={template === 'vision' ? '例如：职业愿景' : '例如：健康'}
                  autoFocus
                />
              </label>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-500">GitHub owner</span>
                  <input
                    className={input}
                    value={githubOwner}
                    onChange={(e) => setGithubOwner(e.target.value)}
                    placeholder="e.g. vercel"
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-500">仓库</span>
                  <input
                    className={input}
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="e.g. next.js"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">Area 名称</span>
                <input
                  className={input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="可选的显示名称覆盖"
                />
              </label>
            </>
          )}

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">
              Slug <span className="text-neutral-400">（根据名称自动生成，可编辑）</span>
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
              <p className="mt-1 text-[11px] text-red-500">已有 Area 使用这个 slug。</p>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">
              标签 <span className="text-neutral-400">（逗号分隔，可选）</span>
            </span>
            <input
              className={input}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="例如：工作，个人"
            />
          </label>

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
          <button className={btnPrimary} onClick={() => void submit()} disabled={!canCreate || busy}>
            {busy ? '创建中…' : '创建 Area'}
          </button>
        </footer>
      </div>
    </div>
  );
}
