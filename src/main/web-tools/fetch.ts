import { clipText, extractHtmlTitle, stripHtml } from './html';
import { assertPublicNetworkTarget, fetchTextWithLimit, parsePublicHttpUrl } from './safety';

export interface WebFetchInput {
  url: string;
  maxChars?: number;
}

export interface WebFetchOutput {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType: string;
  title?: string;
  text: string;
  bytesRead: number;
  truncated: boolean;
}

export async function runWebFetch(input: WebFetchInput): Promise<WebFetchOutput> {
  const url = parsePublicHttpUrl(input.url);
  await assertPublicNetworkTarget(url);
  const maxChars = clampInteger(input.maxChars ?? 12_000, 1_000, 40_000);
  const response = await fetchTextWithLimit(url, {
    maxBytes: Math.max(64_000, maxChars * 8),
    timeoutMs: 25_000
  });
  const isHtml = /\bhtml\b/i.test(response.contentType);
  const extracted = isHtml ? stripHtml(response.text) : response.text.trim();
  const clipped = clipText(extracted, maxChars);
  return {
    url: url.toString(),
    finalUrl: response.finalUrl,
    status: response.status,
    ok: response.ok,
    contentType: response.contentType,
    ...(isHtml ? { title: extractHtmlTitle(response.text) } : {}),
    text: clipped.text,
    bytesRead: response.bytesRead,
    truncated: response.truncated || clipped.truncated
  };
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return min;
  return Math.max(min, Math.min(max, value));
}
