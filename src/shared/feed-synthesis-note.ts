import type {
  FeedClusterPayload,
  FeedDigestPayload,
  FeedRecommendation,
  FeedReportPayload
} from './feed';
import type { CreateNoteInput } from './note';
import type { SynthesisArtifact } from './synthesis';

export type FeedSynthesisNoteArtifact =
  | SynthesisArtifact<FeedDigestPayload>
  | SynthesisArtifact<FeedClusterPayload>
  | SynthesisArtifact<FeedReportPayload>;

export function feedSynthesisArtifactToNoteInput(
  artifact: FeedSynthesisNoteArtifact
): CreateNoteInput {
  const title = feedSynthesisNoteTitle(artifact);
  return {
    type: 'daily_summary',
    title,
    body: feedSynthesisMarkdown(artifact, title),
    tags: ['feed', 'synthesis'],
    source: {
      kind: 'synthesis',
      ref: artifact.id,
      excerpt: feedSynthesisExcerpt(artifact)
    },
    synthesis_ref: artifact.id
  };
}

export function feedSynthesisNoteTitle(artifact: FeedSynthesisNoteArtifact): string {
  if (artifact.kind === 'feed.digest') {
    const payload = artifact.payload as FeedDigestPayload;
    return `Feed 摘要 ${payload.date || dateFromScope(artifact.scope_key) || artifact.created_at.slice(0, 10)}`;
  }
  if (artifact.kind === 'feed.cluster') {
    const payload = artifact.payload as FeedClusterPayload;
    const scope = payload.scope || artifact.scope_key.replace(/^feed\.cluster:/, '');
    return `Feed 聚类 ${scope}`;
  }
  const payload = artifact.payload as FeedReportPayload;
  return `Feed 报告 ${payload.date || dateFromScope(artifact.scope_key) || artifact.created_at.slice(0, 10)}`;
}

function feedSynthesisMarkdown(artifact: FeedSynthesisNoteArtifact, title: string): string {
  const lines = [
    `# ${title}`,
    '',
    `> 来源：Feed AI 合成。Artifact：\`${artifact.id}\`。`,
    `> 生成时间：${formatDateTime(artifact.provenance.generated_at || artifact.created_at)}。状态：${artifact.status}。`,
    ''
  ];

  if (artifact.kind === 'feed.digest') {
    return [...lines, ...digestMarkdown(artifact.payload as FeedDigestPayload)].join('\n').trimEnd() + '\n';
  }
  if (artifact.kind === 'feed.cluster') {
    return [...lines, ...clusterMarkdown(artifact.payload as FeedClusterPayload)].join('\n').trimEnd() + '\n';
  }
  return [...lines, ...reportMarkdown(artifact.payload as FeedReportPayload)].join('\n').trimEnd() + '\n';
}

function digestMarkdown(payload: FeedDigestPayload): string[] {
  return [
    '## 概览',
    '',
    payload.headline || `${payload.item_count} 条 Feed 信号`,
    '',
    '## 重点信号',
    '',
    ...emptyAwareList(
      payload.highlights,
      (item) =>
        `- [${escapeMarkdownLinkText(item.title)}](${item.url})${scoreText(item.relevance_score, item.novelty_score)}${
          item.summary ? `：${item.summary}` : ''
        }`
    ),
    '',
    ...recommendationsMarkdown(payload.recommendations)
  ];
}

function clusterMarkdown(payload: FeedClusterPayload): string[] {
  return [
    '## 聚类范围',
    '',
    payload.scope || '当前 Feed 范围',
    '',
    '## 主题聚类',
    '',
    ...emptyAwareList(payload.clusters, (cluster) =>
      [
        `- ${cluster.label}${scoreText(cluster.relevance_score, cluster.novelty_score)}`,
        cluster.rationale ? `  - 理由：${cluster.rationale}` : '',
        cluster.key_claims?.length ? `  - 关键主张：${cluster.key_claims.join('；')}` : '',
        cluster.item_ids.length ? `  - 条目：${cluster.item_ids.map((id) => `\`${id}\``).join('、')}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    )
  ];
}

function reportMarkdown(payload: FeedReportPayload): string[] {
  return [
    '## 概览',
    '',
    payload.headline || `${payload.item_count} 条 Feed 信号`,
    '',
    payload.executive_summary || '暂无执行摘要。',
    '',
    '## 分析段落',
    '',
    ...emptyAwareList(payload.sections, (section) =>
      [
        `- ${section.title}`,
        `  - 摘要：${section.summary}`,
        section.key_changes?.length ? `  - 变化：${section.key_changes.join('；')}` : '',
        section.repeated_claims?.length ? `  - 重复主张：${section.repeated_claims.join('；')}` : '',
        section.why_it_matters ? `  - 为什么重要：${section.why_it_matters}` : '',
        section.recommended_item_ids?.length
          ? `  - 建议处理：${section.recommended_item_ids.map((id) => `\`${id}\``).join('、')}`
          : ''
      ]
        .filter(Boolean)
        .join('\n')
    ),
    '',
    ...recommendationsMarkdown(payload.recommendations)
  ];
}

function recommendationsMarkdown(recommendations: FeedRecommendation[] | undefined): string[] {
  if (!recommendations?.length) return [];
  return [
    '## 建议动作',
    '',
    ...recommendations.map((item) =>
      `- ${item.label || item.kind}：${item.reason}${
        item.item_ids?.length ? `（条目：${item.item_ids.map((id) => `\`${id}\``).join('、')}）` : ''
      }`
    )
  ];
}

function feedSynthesisExcerpt(artifact: FeedSynthesisNoteArtifact): string | undefined {
  if (artifact.kind === 'feed.digest') return (artifact.payload as FeedDigestPayload).headline;
  if (artifact.kind === 'feed.cluster') {
    const payload = artifact.payload as FeedClusterPayload;
    return `${payload.clusters.length} 个 Feed 聚类`;
  }
  const payload = artifact.payload as FeedReportPayload;
  return payload.headline || payload.executive_summary;
}

function emptyAwareList<T>(items: T[], render: (item: T) => string): string[] {
  if (!items.length) return ['- 暂无。'];
  return items.map(render);
}

function scoreText(relevance?: number, novelty?: number): string {
  const parts = [
    typeof relevance === 'number' ? `相关 ${Math.round(relevance * 100)}%` : '',
    typeof novelty === 'number' ? `新意 ${Math.round(novelty * 100)}%` : ''
  ].filter(Boolean);
  return parts.length ? `（${parts.join('，')}）` : '';
}

function dateFromScope(scopeKey: string): string | undefined {
  return scopeKey.match(/\d{4}-\d{2}-\d{2}/)?.[0];
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/[[\]]/g, '\\$&');
}
