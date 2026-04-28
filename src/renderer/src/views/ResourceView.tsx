import { useEffect, useMemo, useState } from 'react';
import type {
  CreateResourceInput,
  LinkResourceRefInput,
  Resource,
  ResourceRef,
  ResourceRefKind,
  ResourceSection,
  ResourceStatus,
  ResourceSuggestion,
  ResourceSummary
} from '@shared/resource';
import type { SynthesisArtifact } from '@shared/synthesis';
import { SynthesisActionCard } from '../components/synthesis';

const RESOURCE_SECTIONS: ResourceSection[] = ['canonical', 'distilled', 'related', 'people', 'projects_touched'];
const REF_KINDS: ResourceRefKind[] = ['note', 'library_item', 'kb_item', 'project', 'area', 'person', 'url'];
const RESOURCE_STATUSES: ResourceStatus[] = ['active', 'dormant', 'evolved', 'archived'];

export function ResourceView(): JSX.Element {
  const [resources, setResources] = useState<ResourceSummary[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [active, setActive] = useState<Resource | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [areas, setAreas] = useState('');
  const [evolvedTo, setEvolvedTo] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [linkRef, setLinkRef] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkKind, setLinkKind] = useState<ResourceRefKind>('note');
  const [linkSection, setLinkSection] = useState<ResourceSection>('distilled');
  const [engagementTitle, setEngagementTitle] = useState('');
  const [engagementSummary, setEngagementSummary] = useState('');
  const [suggestions, setSuggestions] = useState<ResourceSuggestion[]>([]);
  const [suggestionArtifacts, setSuggestionArtifacts] = useState<Record<string, SynthesisArtifact | null>>({});
  const [scopedChatMessage, setScopedChatMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload(nextSlug = activeSlug): Promise<void> {
    const list = await window.orbit.resources.list();
    setResources(list);
    const slug = nextSlug ?? list[0]?.frontmatter.slug ?? null;
    setActiveSlug(slug);
    if (!slug) {
      setActive(null);
      return;
    }
    setActive(await window.orbit.resources.get(slug));
  }

  useEffect(() => {
    void reload();
    const off = window.orbit.resources.onEvent((event) => void reload(event.resource.frontmatter.slug));
    return off;
  }, []);

  useEffect(() => {
    if (!active) return;
    setTitle(active.frontmatter.title);
    setBody(active.body);
    setTags(active.frontmatter.tags.join(', '));
    setAreas((active.frontmatter.areas ?? []).map((area) => area.area_slug).join(', '));
    setEvolvedTo(active.frontmatter.evolved_to ?? '');
  }, [active?.frontmatter.id, active?.frontmatter.updated]);

  const refsBySection = useMemo(() => {
    const map = new Map<ResourceSection, ResourceRef[]>();
    for (const section of RESOURCE_SECTIONS) map.set(section, []);
    for (const ref of active?.refs ?? []) map.get(ref.section)?.push(ref);
    return map;
  }, [active?.refs]);

  async function selectResource(slug: string): Promise<void> {
    setActiveSlug(slug);
    setActive(await window.orbit.resources.get(slug));
  }

  async function createResource(): Promise<void> {
    const trimmed = createTitle.trim();
    if (!trimmed) {
      setError('Resource title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input: CreateResourceInput = {
        title: trimmed,
        tags: splitTags(tags),
        areas: splitAreas(areas),
        body: `# ${trimmed}\n\n## Why this matters\n\n\n## Current understanding\n\n`
      };
      const created = await window.orbit.resources.create(input);
      setCreateTitle('');
      setActiveSlug(created.frontmatter.slug);
      await reload(created.frontmatter.slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveResource(): Promise<void> {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await window.orbit.resources.update(active.frontmatter.slug, {
        title,
        body,
        tags: splitTags(tags),
        areas: splitAreas(areas),
        evolved_to: evolvedTo.trim() || undefined
      });
      await reload(active.frontmatter.slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archiveResource(): Promise<void> {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await window.orbit.resources.archive(active.frontmatter.slug);
      setActiveSlug(null);
      await reload(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addRef(): Promise<void> {
    if (!active || !linkRef.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const input: LinkResourceRefInput = {
        kind: linkKind,
        ref: linkRef.trim(),
        section: linkSection,
        source: 'manual'
      };
      if (linkTitle.trim()) input.title = linkTitle.trim();
      await window.orbit.resources.linkRef(active.frontmatter.slug, input);
      setLinkRef('');
      setLinkTitle('');
      await reload(active.frontmatter.slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function recordEngagement(): Promise<void> {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await window.orbit.resources.engage(active.frontmatter.slug, {
        title: engagementTitle.trim() || 'Resource engagement',
        summary: engagementSummary.trim() || undefined
      });
      setEngagementTitle('');
      setEngagementSummary('');
      await reload(active.frontmatter.slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadSuggestions(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const nextSuggestions = await window.orbit.resources.suggestFromNotes({ minNotes: 2, limit: 8 });
      setSuggestions(nextSuggestions);
      const artifactIds = [...new Set(nextSuggestions.map((item) => item.synthesis_ref).filter((id): id is string => Boolean(id)))];
      const artifacts = await Promise.all(artifactIds.map(async (id) => [id, await window.orbit.synthesis.getArtifact(id)] as const));
      setSuggestionArtifacts(Object.fromEntries(artifacts));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createFromSuggestion(suggestion: ResourceSuggestion): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const created = await window.orbit.resources.createFromSuggestion({ suggestion });
      await reload(created.frontmatter.slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function promoteRef(refId: string, section: ResourceSection = 'canonical'): Promise<void> {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await window.orbit.resources.promoteRef(active.frontmatter.slug, { ref_id: refId, section });
      await reload(active.frontmatter.slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openScopedChat(): Promise<void> {
    if (!active) return;
    const conversation = await window.orbit.chat.createConversation({
      anchor: { kind: 'ask_anywhere_session', refId: `resource:${active.frontmatter.slug}`, addedAt: new Date().toISOString() },
      scope: { kind: 'resource', resource_slug: active.frontmatter.slug },
      title: `Resource: ${active.frontmatter.title}`
    });
    await window.orbit.chat.setLastActiveConversation({ kind: 'resource', resource_slug: active.frontmatter.slug }, conversation.id);
    setScopedChatMessage(`Scoped chat ready: ${conversation.title ?? conversation.id}`);
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-80 shrink-0 border-r border-neutral-200 bg-white/60 dark:border-neutral-800 dark:bg-neutral-950/40">
        <div className="space-y-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
          <div>
            <h1 className="text-lg font-semibold">Resources</h1>
            <p className="text-xs text-neutral-500">Topic workstations for long-lived interests.</p>
          </div>
          <div className="flex gap-2">
            <input
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              placeholder="New resource title"
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
            />
            <button onClick={() => void createResource()} className="rounded bg-sky-600 px-3 py-2 text-xs text-white">
              Create
            </button>
          </div>
          <button onClick={() => void loadSuggestions()} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
            Suggest from Notes
          </button>
          {error ? <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {resources.map((resource) => (
            <button
              key={resource.frontmatter.id}
              onClick={() => void selectResource(resource.frontmatter.slug)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                activeSlug === resource.frontmatter.slug ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
              }`}
            >
              <div className="truncate font-medium">{resource.frontmatter.title}</div>
              <div className="mt-1 text-[11px] text-neutral-500">
                {resource.frontmatter.depth} · {resource.frontmatter.engagement_count} engagements · {resource.counts.distilled} notes
              </div>
            </button>
          ))}
          {suggestions.length > 0 ? (
            <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Emerging topics</div>
              {suggestions.map((suggestion) => (
                <SynthesisActionCard
                  key={suggestion.tag}
                  artifact={suggestion.synthesis_ref ? suggestionArtifacts[suggestion.synthesis_ref] : null}
                  title={suggestion.topic}
                  description={`${suggestion.note_count} notes · ${Math.round(suggestion.confidence * 100)}% confidence`}
                  primaryLabel="Create"
                  onPrimary={() => void createFromSuggestion(suggestion)}
                  onRefresh={() => void loadSuggestions()}
                />
              ))}
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <div className="flex items-center gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
              />
              <select
                value={active.frontmatter.status}
                onChange={(event) => void window.orbit.resources.update(active.frontmatter.slug, { status: event.target.value as ResourceStatus }).then(() => reload(active.frontmatter.slug))}
                className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900"
              >
                {RESOURCE_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <select
                value={active.frontmatter.depth}
                onChange={(event) => void window.orbit.resources.update(active.frontmatter.slug, { depth: event.target.value as Resource['frontmatter']['depth'] }).then(() => reload(active.frontmatter.slug))}
                className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900"
              >
                {['exploring', 'practicing', 'mastered', 'teaching'].map((depth) => (
                  <option key={depth} value={depth}>{depth}</option>
                ))}
              </select>
              <button onClick={() => void archiveResource()} className="rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
                Archive
              </button>
              <button onClick={() => void openScopedChat()} className="rounded border border-sky-300 px-3 py-1.5 text-xs text-sky-700 dark:border-sky-800 dark:text-sky-200">
                Scoped Chat
              </button>
              <button onClick={() => void saveResource()} className="rounded bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">
                {busy ? 'Working…' : 'Save'}
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px] overflow-hidden">
              <main className="flex min-h-0 flex-col">
                <div className="border-b border-neutral-200 p-3 dark:border-neutral-800">
                  <input
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                    placeholder="tags, comma separated"
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                  />
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <input
                      value={areas}
                      onChange={(event) => setAreas(event.target.value)}
                      placeholder="areas, comma separated"
                      className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                    />
                    <input
                      value={evolvedTo}
                      onChange={(event) => setEvolvedTo(event.target.value)}
                      placeholder="evolved to resource slug"
                      className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
                    />
                  </div>
                  {scopedChatMessage ? <div className="mt-2 rounded bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:bg-sky-950/30 dark:text-sky-200">{scopedChatMessage}</div> : null}
                </div>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="min-h-0 flex-1 resize-none bg-white p-5 font-mono text-sm leading-6 outline-none dark:bg-neutral-950"
                />
              </main>

              <aside className="min-h-0 overflow-y-auto border-l border-neutral-200 p-4 dark:border-neutral-800">
                <section className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                  <h2 className="text-sm font-semibold">Link material</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <select value={linkKind} onChange={(event) => setLinkKind(event.target.value as ResourceRefKind)} className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900">
                      {REF_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                    </select>
                    <select value={linkSection} onChange={(event) => setLinkSection(event.target.value as ResourceSection)} className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900">
                      {RESOURCE_SECTIONS.map((section) => <option key={section} value={section}>{labelForSection(section)}</option>)}
                    </select>
                  </div>
                  <input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="Optional title" className="mt-2 w-full rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
                  <input value={linkRef} onChange={(event) => setLinkRef(event.target.value)} placeholder="Path, URL, or id" className="mt-2 w-full rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
                  <button onClick={() => void addRef()} className="mt-2 rounded bg-sky-600 px-3 py-1.5 text-xs text-white">Link</button>
                </section>

                <section className="mt-4 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                  <h2 className="text-sm font-semibold">Record engagement</h2>
                  <input value={engagementTitle} onChange={(event) => setEngagementTitle(event.target.value)} placeholder="What changed?" className="mt-2 w-full rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
                  <textarea value={engagementSummary} onChange={(event) => setEngagementSummary(event.target.value)} placeholder="Short note" className="mt-2 h-20 w-full resize-none rounded border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900" />
                  <button onClick={() => void recordEngagement()} className="mt-2 rounded bg-neutral-900 px-3 py-1.5 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900">Record</button>
                </section>

                <section className="mt-4 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">timeline</div>
                  <div className="mt-2 space-y-2">
                    {active.timeline.slice().reverse().map((entry) => (
                      <div key={entry.id} className="rounded-lg bg-neutral-50 p-2 text-xs dark:bg-neutral-900">
                        <div className="font-medium">{entry.title}</div>
                        <div className="text-[11px] text-neutral-500">{entry.at}</div>
                        {entry.summary ? <div className="mt-1 text-neutral-600 dark:text-neutral-300">{entry.summary}</div> : null}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="mt-4 space-y-3">
                  {RESOURCE_SECTIONS.map((section) => (
                    <div key={section} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{labelForSection(section)}</div>
                      <div className="mt-2 space-y-2">
                        {(refsBySection.get(section) ?? []).map((ref) => (
                          <div key={ref.id} className="rounded-lg bg-neutral-50 p-2 text-xs dark:bg-neutral-900">
                             <div className="font-medium">{ref.title ?? ref.ref}</div>
                             <div className="truncate text-neutral-500">{ref.kind} · {ref.ref}</div>
                             {ref.section !== 'canonical' ? <button onClick={() => void promoteRef(ref.id)} className="mt-1 mr-2 text-[11px] text-sky-600">Promote canonical</button> : null}
                             <button onClick={() => void window.orbit.resources.unlinkRef(active.frontmatter.slug, ref.id).then(() => reload(active.frontmatter.slug))} className="mt-1 text-[11px] text-red-500">Unlink</button>
                           </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              </aside>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">Create or select a Resource.</div>
        )}
      </section>
    </div>
  );
}

function splitTags(value: string): string[] {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

function splitAreas(value: string): NonNullable<CreateResourceInput['areas']> {
  return value
    .split(',')
    .map((area) => area.trim())
    .filter(Boolean)
    .map((area, index) => ({
      area_slug: area.toLowerCase().replace(/\s+/g, '-'),
      primary: index === 0,
      assigned_at: new Date().toISOString(),
      assigned_by: 'user' as const
    }));
}

function labelForSection(section: ResourceSection): string {
  if (section === 'projects_touched') return 'projects touched';
  return section;
}
