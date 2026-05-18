# Feed Subscription Data Flow

> Status: implementation foundation landed
> Date: 2026-05-14
> Related docs: `docs/VISION.md`, `docs/ROADMAP.md`, `docs/architecture/data-layering.md`, `docs/architecture/entity-flow.md`, `docs/architecture/synthesis-layer.md`, `docs/plans/2026-05-13-personal-memory-intelligence-layer.md`

---

## 1. Why Feed First

The Personal Memory Intelligence Layer needs a steady stream of real data before higher-level analysis can become valuable.

Feed subscription is the right first input loop:

- It creates daily recurring signal without requiring the user to manually save URLs.
- It gives Orbit enough volume to test clustering, translation, entity extraction, resource matching, and reports.
- It keeps Orbit aligned with the user's long-term interests because subscription sources are explicit user choices.
- It provides a clean promotion path from external signal to Library, Notes, Resources, and reports.

The target is not "an RSS reader". The target is a personal signal pipeline:

```text
subscribed sources
  -> daily incoming items
  -> feed-scoped enrichment and triage
  -> save selected items to Library
  -> generate reports / QA / resource updates
  -> feed long-term personal memory
```

---

## 2. Key Layering Decision

The existing doctrine says "Feeds are not user data; only Library is user data." That is directionally right for raw feed items, but too coarse for subscription itself.

The refined decision:

```text
FeedSource subscription config is Layer 1 truth.
FeedItem fetched content is Layer 0 signal until saved.
Feed enrichment / translation / analysis is Layer 2 synthesis.
LibraryItem created from a FeedItem is Layer 1 truth.
Multi-item feed reports are Layer 2 until explicitly saved/materialized.
```

This gives Orbit the best of both sides:

- The user's subscriptions are durable personal intent and can belong to Areas/Resources.
- The flood of fetched items does not pollute the user's long-term knowledge by default.
- AI analysis can happen in feed scope without becoming truth.
- Saved items carry their source and useful enrichments forward into Library.

---

## 3. Entity Model

### 3.1 FeedSource: Layer 1 Attention Configuration

`FeedSource` represents a user-approved recurring source of signal.

It is truth because the user intentionally configured it.

Suggested fields:

```typescript
interface FeedSource {
  id: string;
  title: string;
  url: string;
  kind: 'rss' | 'youtube' | 'podcast' | 'newsletter' | 'twitter' | 'reddit' | 'hackernews' | 'github' | 'custom';
  enabled: boolean;

  // User-owned routing.
  areas?: AreaRef[];
  resource_refs?: string[];
  tags?: string[];
  priority?: 'low' | 'normal' | 'high';

  // Fetch policy.
  fetch_policy?: {
    schedule?: 'manual' | 'hourly' | 'daily' | 'weekly';
    preferred_time?: string;
    max_items_per_fetch?: number;
    backfill_limit?: number;
  };

  // Processing policy.
  processing_policy?: {
    preferred_language?: string;
    auto_translate?: boolean;
    auto_summarize?: boolean;
    auto_match_resources?: boolean;
    auto_cluster?: boolean;
  };

  // Retention policy for unsaved Layer 0 items.
  retention_policy?: {
    unsaved_days?: number;
    ignored_days?: number;
    pin_if_used_in_report?: boolean;
  };

  added_at: string;
  updated_at?: string;
  last_fetched_at?: string;
  last_fetch_error?: string;
}
```

Product meaning:

- A source can appear on Area dashboards as a "radar".
- A source can be attached to a Resource as "watch this topic".
- Source health belongs on Dashboard / Feed page.
- Source changes are meaningful Timeline events.

### 3.2 FeedFetchRun: Operational History

Fetch runs are not knowledge. They are operational trace.

Suggested fields:

```typescript
interface FeedFetchRun {
  id: string;
  source_id: string;
  started_at: string;
  completed_at?: string;
  status: 'success' | 'partial' | 'failed';
  fetched_count: number;
  created_count: number;
  skipped_count: number;
  error?: string;
  etag?: string;
  last_modified?: string;
}
```

Storage can live under `.orbit/feed/runs/` or `feeds/.orbit-runs/`.

### 3.3 FeedItem: Layer 0 Signal Snapshot

`FeedItem` is fetched external signal. It is not user truth yet.

Suggested fields:

```typescript
interface FeedItem {
  id: string;
  source_id: string;
  fetch_run_id?: string;

  // Identity / dedupe.
  guid?: string;
  url: string;
  canonical_url?: string;
  dedupe_key: string;
  content_hash?: string;

  // Source metadata.
  title: string;
  author?: string;
  site_name?: string;
  published_at?: string;
  fetched_at: string;
  language?: string;
  image_url?: string;

  // Raw / extracted payload refs.
  raw_ref?: string;
  extracted_ref?: string;
  excerpt?: string;

  // User triage.
  status: 'new' | 'seen' | 'ignored' | 'saved' | 'expired';
  seen_at?: string;
  ignored_at?: string;
  saved_library_item_id?: string;

  // Layer 2 refs.
  enrichment_artifact_ids?: string[];
  collection_artifact_ids?: string[];

  // Retention.
  pinned_by?: Array<{ kind: 'library' | 'synthesis' | 'report'; ref: string }>;
}
```

`raw_ref` can point to fetched XML/HTML/JSON. `extracted_ref` can point to readable Markdown/text. This prevents every FeedItem JSON file from becoming huge while keeping local-first inspectability.

### 3.4 FeedItem Enrichment: Layer 2

Per-item AI output should be SynthesisArtifact, not FeedItem truth.

Suggested synthesis kinds:

```typescript
'feed.item.translation'
'feed.item.summary'
'feed.item.analysis'
'feed.item.entities'
'feed.item.resource_match'
'feed.item.qa_candidate'
```

Suggested scope keys:

```text
feed:item:<feed-item-id>:translation:<language>
feed:item:<feed-item-id>:summary
feed:item:<feed-item-id>:analysis
feed:item:<feed-item-id>:entities
feed:item:<feed-item-id>:resource-match
```

Examples:

- Translation: title, excerpt, and readable body in user's preferred language.
- Analysis: why this matters, key claims, novelty, confidence.
- Resource match: likely related Resources/Areas and why.
- Entity extraction: cheap deterministic first, optional LLM refinement later.

### 3.5 Feed Collection Analysis: Layer 2

Multi-item analysis should be its own artifact. It should not be copied into every child item.

Suggested synthesis kinds:

```typescript
'feed.digest'
'feed.cluster'
'feed.report.daily'
'feed.report.weekly'
'feed.trend'
'feed.watch.alert'
```

Suggested scope keys:

```text
feed:digest:<YYYY-MM-DD>
feed:cluster:<source-or-all>:<YYYY-MM-DD>
feed:report:daily:<YYYY-MM-DD>
feed:report:weekly:<YYYY-Www>
feed:trend:<resource-or-area>:<period>
```

The artifact sources should list all relevant FeedItems, and optionally LibraryItems when some feed items were already saved.

### 3.6 YouTube Transcript Tracks

YouTube feed items need a richer media payload than RSS items because subtitles are both source evidence and reading UI.

For video feeds, `FeedItem.media` should carry transcript tracks:

```typescript
interface FeedMediaPayload {
  kind: 'video' | 'audio';
  provider: 'youtube';
  duration_seconds?: number;
  transcript_tracks: FeedTranscriptTrackRef[];
  preferred_track_id?: string;
  preferred_bilingual_pair_id?: string;
  bilingual_pairs?: FeedBilingualPairRef[];
}
```

Track rules:

- YouTube manual subtitles and automatic subtitles are source-derived Layer 0 evidence.
- AI subtitles are translation tracks, not source truth.
- Every subtitle track stores segmented JSON under `.orbit/feed/extracted/`.
- Raw YouTube subtitle files stay under `.orbit/feed/raw/`.
- AI subtitle translations should preserve segment alignment so UI can render each translated line under the original line.

The AI translation artifact should be `feed.youtube.subtitle.ai`, with payload refs to:

- source transcript track
- translated segment file
- optional interleaved bilingual markdown

When a YouTube FeedItem is saved to Library, transcript track refs and bilingual pair refs should follow in Library frontmatter, while the original transcript snapshot remains the saved body/source snapshot.

---

## 4. Single-Item Flow

### 4.1 Fetch

```text
FeedSource
  -> FeedFetchRun
  -> FeedItem raw snapshot
  -> readable extraction
  -> deterministic metadata / dedupe
  -> optional per-item enrichment jobs
```

The Feed page should show the best available display version:

- translated title/excerpt if translation exists
- otherwise original title/excerpt
- labels for source, language, freshness, and related Resource/Area

### 4.2 Translate

Translation is not truth. It is a Layer 2 reading aid.

Rules:

- Keep original content as the source snapshot.
- Store translation as `feed.item.translation`.
- The UI may default to translated display based on user preference.
- The artifact must cite the source FeedItem and prompt/model.
- Translation can be stale if extracted source content changes.

### 4.3 Analyze

Per-item analysis is also Layer 2.

Useful outputs:

- why it may matter
- key claims
- mentioned entities
- novelty compared with recent saved Library/Resources
- related Resources/Areas
- suggested user action: ignore, save, save to Resource, create task, watch

This analysis helps triage, but does not enter global search unless saved or accepted.

### 4.4 Save To Library

When the user saves a FeedItem to Library, the item crosses the promotion gate.

Default promotion should create:

```text
LibraryItem
  frontmatter.source.kind = "feed"
  frontmatter.source.feed_source_id
  frontmatter.source.feed_item_id
  frontmatter.source.url
  body = original extracted content or excerpt
```

But that is not enough. The saved LibraryItem should carry the feed context.

Suggested Library additions:

```typescript
interface LibrarySource {
  kind: 'feed' | 'url' | 'manual' | 'quick_capture' | 'share';
  url?: string;
  canonical_url?: string;
  feed_item_id?: string;
  feed_source_id?: string;
  feed_fetch_run_id?: string;
  source_title?: string;
  fetched_at?: string;
  published_at?: string;
  language?: string;
  note?: string;
}

interface LibraryItemFrontmatter {
  // Existing fields...
  source?: LibrarySource;

  // New promoted feed context.
  source_snapshot_ref?: string;
  promoted_enrichment_artifact_ids?: string[];
  feed_collection_artifact_ids?: string[];
  preferred_display_artifact_id?: string;
}
```

Promotion behavior:

1. Copy or reference original extracted content into Library.
2. Pin the original FeedItem so it is not expired.
3. Attach per-item enrichment artifact IDs.
4. Attach relevant collection artifact IDs, such as the daily digest or cluster that surfaced the item.
5. Mark the FeedItem as `saved` with `saved_library_item_id`.
6. Emit `promote.feed_to_library`.

Important distinction:

- The original article/video/transcript becomes Layer 1 Library material.
- Translation and AI analysis remain Layer 2 but follow the item by reference and retention pin.
- If the user explicitly chooses "save translated reading copy", the Library body can include translated text, but it must preserve original source metadata and mark the translation artifact.

---

## 5. Multi-Item Analysis Flow

Multi-item analysis is not a LibraryItem. It is a report, digest, cluster, trend, or alert.

### 5.1 Daily Feed Digest

```text
new FeedItems for date
  -> group by source / area / resource match
  -> generate feed.digest
  -> show in Feed / Today
```

This remains Layer 2 and feed-scoped.

User actions:

- save individual item to Library
- ignore item/source
- create Resource from recurring topic
- save digest as Note
- ask across digest

### 5.2 Feed Cluster

```text
FeedItems in period
  -> deterministic grouping / embeddings / entities
  -> feed.cluster artifact
  -> optional LLM naming and rationale
```

Cluster output should include:

- cluster label
- item IDs
- source mix
- key claims
- novelty score
- related Resources/Areas
- suggested actions

### 5.3 Feed Report

A report is a stronger synthesis than a digest. It should answer "what changed or matters?"

Examples:

- "What changed today in AI coding agents?"
- "Which saved feeds relate to my Orbit Resource?"
- "Which claims are repeated across multiple sources?"
- "What should I read first?"

Report behavior:

- Stored as Layer 2 SynthesisArtifact.
- Sources include FeedItems and optionally saved LibraryItems.
- If user saves the report, materialize it as a Note, not a LibraryItem.
- If user creates a task/project from it, that is a separate promotion gate.

### 5.4 If A Report Mentions Unsaved Items

If a report is kept or saved, its unsaved source items need retention protection.

Rules:

- A saved report pins cited FeedItems using `pinned_by: [{ kind: 'report', ref: reportId }]`.
- If the report materializes as a Note, the Note's `synthesis_ref` points to the report artifact.
- Citations can resolve to FeedItem if unsaved, or LibraryItem if later saved.
- When a cited FeedItem is later saved to Library, the citation can be upgraded to include `library_item_id`.

This prevents a report from rotting because its sources expired.

---

## 6. Combining Feed With Other Layers

### 6.1 FeedSource With Areas And Resources

Because FeedSource is Layer 1 configuration, it can attach to Areas and Resources.

Examples:

- Area "AI Tools" subscribes to official blogs and newsletters.
- Resource "Personal Memory Systems" watches papers, product blogs, and YouTube channels.

FeedSource should contribute to:

- Area Dashboard: source health, new signals, related saved items.
- Resource Workstation: watchlist, latest signals, feed-derived report cards.
- Review: inactive sources, high-noise sources, valuable sources.

### 6.2 FeedItems With Areas And Resources

Raw FeedItems should not directly become Resource refs.

They can have Layer 2 suggestions:

```text
feed.item.resource_match
```

The user can act on suggestions:

- Save to Library with Resource refs.
- Ignore suggestion.
- Save as Note.
- Create Resource.

### 6.3 Feed Analysis With Search

Unsaved feed items should not enter global truth search.

Search policy:

- Main Search indexes saved LibraryItems and accepted Notes.
- Feed-scoped search can search unsaved FeedItems inside Feed UI.
- Feed analysis artifacts appear in global search only if saved/materialized or explicitly enabled in developer/feed scope.
- Saved LibraryItems can include original and translated text in semantic projection, but the UI must label translation as synthesis.

### 6.4 Feed Analysis With Memory

Feed should not create long-term memory by itself.

Memory candidates can be generated from:

- saved LibraryItems
- saved feed reports
- repeated clusters over time
- user-confirmed watch alerts
- reports accepted during Review

This avoids turning every daily news blip into personal memory.

---

## 7. Storage Layout

Current implementation stores sources and items under `feeds/`. That can remain initially.

Suggested future layout:

```text
feeds/
  _sources.json                         # Layer 1 attention configuration
  <source-id>/
    <feed-item-id>.json                 # Layer 0 item metadata

.orbit/feed/
  runs/
    <fetch-run-id>.json
  raw/
    <feed-item-id>.html|xml|json
  extracted/
    <feed-item-id>.md
  indexes/
    feed-scope-index.json

.orbit/synthesis/
  artifacts/
    synth-*.json                        # translations, analyses, digest, cluster, reports

library/
  articles|videos|pdfs|bookmarks/
    <saved-item>.md                     # Layer 1 promoted material
```

Potential later migration:

- Move `FeedSource` config to `.orbit/feed/sources.json` if we want `feeds/` to remain purely raw Layer 0.
- Or keep `feeds/_sources.json` and explicitly document that this file is Layer 1 configuration while sibling item files are Layer 0 signal.

The second option is simpler and compatible with current code.

---

## 8. Required API Changes

### 8.1 Feed Source

Add:

- `resource_refs`
- `tags`
- `priority`
- `fetch_policy`
- `processing_policy`
- `retention_policy`
- `updated_at`

### 8.2 Feed Item

Add:

- `canonical_url`
- `dedupe_key`
- `content_hash`
- `language`
- `site_name`
- `raw_ref`
- `extracted_ref`
- `excerpt` replacing or complementing `summary`
- `fetch_run_id`
- `enrichment_artifact_ids`
- `collection_artifact_ids`
- `pinned_by`
- `expired` status

### 8.3 Library Promotion

Extend `SaveFeedToLibraryInput`:

```typescript
interface SaveFeedToLibraryInput {
  note?: string;
  tags?: string[];
  areas?: AreaRef[];
  resource_refs?: string[];
  include_enrichments?: boolean;
  preferred_display?: 'original' | 'translated';
  translation_artifact_id?: string;
}
```

Extend `LibrarySource` and `LibraryItemFrontmatter` as described above.

### 8.4 Synthesis Kinds

Add feed-specific kinds:

```typescript
'feed.item.translation'
'feed.youtube.subtitle.ai'
'feed.item.summary'
'feed.item.analysis'
'feed.item.entities'
'feed.item.resource_match'
'feed.item.qa_candidate'
'feed.report.daily'
'feed.report.weekly'
'feed.trend'
'feed.watch.alert'
```

Some may start as local deterministic artifacts and later move to LLM prompts.

---

## 9. Processing Queue

Feed should have a clear background pipeline:

```text
fetch source
  -> parse items
  -> canonicalize/dedupe
  -> fetch readable content
  -> extract metadata/text
  -> deterministic entity/resource hints
  -> optional translation
  -> optional per-item analysis
  -> daily digest/cluster/report
```

Priorities:

- User clicks refresh: interactive.
- Scheduled source refresh: background.
- User opens item: interactive extraction if missing.
- User saves item: user-blocking promotion; ensure extraction first.
- User requests digest/report: interactive synthesis.

Budget rules:

- Deterministic fetch/extraction should be free.
- Translation and LLM analysis should respect source processing policy and global budget.
- Per-item LLM analysis should not run automatically for all low-priority sources.
- Digest can use cheap local clustering first, LLM only for selected clusters.

---

## 10. Product UX

### 10.1 Feed Page

Feed page should become daily signal triage.

Core zones:

- Source sidebar with health and Area/Resource labels.
- Today stream with translated display if available.
- Digest / clusters panel.
- Item inspector with original, translation, analysis, source, actions.

Actions:

- Save to Library.
- Save to Library with translation.
- Ignore.
- Mark source noisy.
- Link source to Area/Resource.
- Generate analysis.
- Ask about item.
- Ask about cluster.
- Save report as Note.

### 10.2 Today

Today should show:

- "New signals from your subscriptions"
- top clusters
- high-priority feed items related to active Resources/Projects
- reading queue from saved feed items

It should not show every raw item.

### 10.3 Review

Review should include:

- high-value sources
- noisy sources
- saved-but-undistilled feed items
- repeated clusters
- feed reports worth saving
- Resources with active new signals

### 10.4 Library

Library should show feed provenance:

- source
- fetched date
- original URL/canonical URL
- translation available
- feed digest/cluster that surfaced it
- related report citations

---

## 11. Implementation Order

### Step 1: Clarify Layer Model In Code And Docs

- Treat `FeedSource` as Layer 1 attention configuration.
- Keep `FeedItem` as Layer 0.
- Keep feed enrichments as Layer 2.
- Document promotion behavior.

### Step 2: Add Fetch Runs And Better FeedItem Fields

- Add fetch run records.
- Add canonical URL, dedupe key, content hash.
- Add language, site name, raw/extracted refs.
- Add retention/pinning fields.

### Step 3: Add Readable Extraction

- Fetch linked page for each item on demand or on save.
- Extract readable text/metadata.
- Store extracted Markdown under `.orbit/feed/extracted/`.

### Step 4: Add Per-Item Enrichment

- Translation artifact.
- Summary/analysis artifact.
- Resource match artifact.
- Feed UI displays these as Layer 2.

### Step 5: Upgrade Save To Library

- Ensure extraction before saving.
- Copy original/extracted content into Library.
- Attach feed source/item/fetch metadata.
- Attach enrichment and collection refs.
- Pin the feed item.

### Step 6: Add Multi-Item Reports

- Daily digest.
- Cluster.
- Feed report.
- Save report as Note.
- Pin cited unsaved items.

### Step 7: Wire Scheduled Refresh

- Scheduled task action should actually call feed refresh.
- Generate daily digest/report after refresh.
- Show run history and source health.

---

## 12. Non-Goals

- Do not index all unsaved FeedItems in global search.
- Do not auto-save all feed items to Library.
- Do not treat AI translation as original source truth.
- Do not copy multi-item reports into every saved item.
- Do not run expensive LLM analysis for every item by default.
- Do not let Feed flood Inbox.

---

## 13. Open Questions

1. Should `FeedSource` remain in `feeds/_sources.json`, or move to `.orbit/feed/sources.json` as explicit Layer 1 config?
2. Should translations be materialized into Library body when saving, or only attached as artifacts?
3. How long should unsaved FeedItems be retained by default?
4. Should saved reports pin all cited feed items forever, or store compact source snapshots instead?
5. Which source kinds matter first: RSS, YouTube, podcast, newsletter, GitHub, Twitter/X?
6. Should feed-scoped search be available before saving items to Library?
7. How should duplicate items across multiple feeds be represented: one FeedItem with many source refs, or linked duplicate FeedItems?

---

## 14. Implementation Snapshot (2026-05-14)

Landed foundation:

- `FeedSource` now carries fetch, processing, retention, tags, Resource refs, and priority policy.
- Fetch creates `FeedFetchRun` records under `.orbit/feed/runs/`.
- `FeedItem` now stores canonical URL, dedupe key, content hash, raw/extracted refs, fetch run ID, enrichment refs, collection refs, and retention pins.
- Save to Library now ensures readable extraction first, writes extracted Markdown into the Library body, and preserves feed provenance plus enrichment/collection refs in Library frontmatter.
- Per-item `feed.item.analysis` and `feed.item.translation` artifact paths exist. Analysis is generated on save; translation is currently a local fallback payload until model-backed translation is wired.
- Multi-item `feed.digest`, `feed.cluster`, and `feed.report.daily` artifacts are generated and pinned back to cited FeedItems.
- Scheduled `feed_refresh` actions now execute real fetches and can generate digest/report artifacts.
- YouTube sources normalize handles/channels/playlists/videos, fetch latest 20 by default, support full initial backfill, and use `yt-dlp` with Chrome cookies.
- YouTube extraction captures available preferred subtitle tracks (`zh-Hans`, `zh-Hant`, `zh`, `en`) as raw subtitle files plus segmented transcript JSON.
- YouTube FeedItems now carry `media.transcript_tracks`, preferred transcript track metadata, subtitle language/status metadata, and Library promotion preserves those refs.
- X sources normalize `@handle` / profile URLs plus `x:following` / `x:for-you` timeline feeds, fetch latest 20 by default with OpenCLI (`twitter search from:<handle>` or `twitter timeline --type following|for-you`), optionally include replies for profile feeds, and save tweet/thread Markdown only when promoted to Library.
- Reddit sources normalize subreddit names/URLs, fetch latest 20 by default with OpenCLI + public JSON fallbacks, and optionally fetch comments when a post is promoted to Library.
- Hacker News sources cover top/new/best/show/ask/jobs via the public API, keep stable story IDs for dedupe, and optionally fetch HN comments when promoted to Library.
- AI subtitle translation has a storage/API path via `attachAiSubtitleTranslation`: translated segment output is saved as an AI transcript track, plus an interleaved bilingual markdown ref for “translation under each original subtitle line”.

Still pending:

- Replace the lightweight HTML-to-text extraction with a stronger readability parser and source-specific extractors for YouTube/podcast/newsletter/GitHub.
- Add model-backed translation, richer analysis prompts, resource matching, entity extraction, and budget controls.
- Build the Feed UI surfaces for source health, run history, item inspector, digest/report panels, transcript track switching, and save-with-translation flows.
- Decide how feed-scoped search should surface unsaved FeedItems without polluting global truth search.
