import { clipText, decodeHtmlEntities, stripHtml } from './html';
import { fetchTextWithLimit } from './safety';

export type WebSearchProvider = 'auto' | 'brave' | 'duckduckgo';

export interface WebSearchInput {
  query: string;
  count?: number;
  provider?: WebSearchProvider;
  country?: string;
  language?: string;
  freshness?: 'day' | 'week' | 'month' | 'year';
}

export interface WebSearchHit {
  title: string;
  url: string;
  snippet?: string;
  source: string;
}

export interface WebSearchOutput {
  query: string;
  provider: Exclude<WebSearchProvider, 'auto'>;
  results: WebSearchHit[];
  attemptedProviders: string[];
}

export async function runWebSearch(input: WebSearchInput): Promise<WebSearchOutput> {
  const query = input.query.trim();
  if (!query) throw new Error('query_required');
  const count = clampInteger(input.count ?? 8, 1, 20);
  const provider = input.provider ?? 'auto';
  const attemptedProviders: string[] = [];
  const errors: string[] = [];

  const candidates: Array<Exclude<WebSearchProvider, 'auto'>> =
    provider === 'auto' ? (process.env.BRAVE_API_KEY ? ['brave', 'duckduckgo'] : ['duckduckgo']) : [provider];

  for (const candidate of candidates) {
    attemptedProviders.push(candidate);
    try {
      const results =
        candidate === 'brave'
          ? await searchBrave({ ...input, query, count })
          : await searchDuckDuckGo({ ...input, query, count });
      if (results.length > 0) return { query, provider: candidate, results, attemptedProviders };
      errors.push(`${candidate}:no_results`);
    } catch (error) {
      errors.push(`${candidate}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`web_search_failed:${errors.join('; ')}`);
}

async function searchBrave(input: Required<Pick<WebSearchInput, 'query'>> & WebSearchInput & { count: number }): Promise<WebSearchHit[]> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) throw new Error('brave_api_key_missing');
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', input.query);
  url.searchParams.set('count', String(input.count));
  if (input.country) url.searchParams.set('country', input.country);
  if (input.language) url.searchParams.set('search_lang', input.language);
  if (input.freshness) url.searchParams.set('freshness', input.freshness);
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-subscription-token': key,
      'user-agent': 'Orbit Ask Anywhere/1.0'
    }
  });
  if (!response.ok) throw new Error(`brave_http_${response.status}`);
  const json = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return (json.web?.results ?? [])
    .filter((item) => item.title && item.url)
    .slice(0, input.count)
    .map((item) => ({
      title: stripHtml(item.title ?? ''),
      url: item.url ?? '',
      ...(item.description ? { snippet: stripHtml(item.description) } : {}),
      source: 'brave'
    }));
}

async function searchDuckDuckGo(input: Required<Pick<WebSearchInput, 'query'>> & WebSearchInput & { count: number }): Promise<WebSearchHit[]> {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', input.query);
  if (input.language) url.searchParams.set('kl', input.language);
  const response = await fetchTextWithLimit(url, {
    maxBytes: 700_000,
    timeoutMs: 20_000,
    headers: {
      accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!response.ok) throw new Error(`duckduckgo_http_${response.status}`);

  const hits: WebSearchHit[] = [];
  const linkPattern = /<a\b[^>]*class=["'][^"']*\bresult__a\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(response.text)) && hits.length < input.count) {
    const rawHref = decodeHtmlEntities(match[1] ?? '');
    const title = stripHtml(match[2] ?? '');
    const resultUrl = normalizeDuckDuckGoResultUrl(rawHref);
    if (!title || !resultUrl) continue;
    const nextIndex = response.text.indexOf('result__a', linkPattern.lastIndex);
    const block = response.text.slice(linkPattern.lastIndex, nextIndex > linkPattern.lastIndex ? nextIndex : linkPattern.lastIndex + 2000);
    const snippetMatch = block.match(/class=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/i);
    const snippet = snippetMatch ? clipText(stripHtml(snippetMatch[1] ?? ''), 600).text : undefined;
    hits.push({
      title,
      url: resultUrl,
      ...(snippet ? { snippet } : {}),
      source: 'duckduckgo'
    });
  }
  return hits;
}

function normalizeDuckDuckGoResultUrl(rawHref: string): string | null {
  try {
    const url = new URL(rawHref, 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return null;
  }
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return min;
  return Math.max(min, Math.min(max, value));
}
