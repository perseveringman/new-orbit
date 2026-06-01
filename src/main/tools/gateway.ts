import path from 'node:path';
import { clipText } from '../web-tools/html';
import { assertPublicNetworkTarget, fetchTextWithLimit, parsePublicHttpUrl } from '../web-tools/safety';
import { SkillLoader } from '../agent-tools/skill-loader';
import {
  readSkillRuntimeConfig,
  resolveSkillEnvValue
} from '../agent-tools/skill-config-store';

export interface GatewayCallContext {
  vaultPath: string;
}

export interface GatewayCallOutput {
  skill: string;
  url: string;
  finalUrl: string;
  method: string;
  status: number;
  ok: boolean;
  contentType: string;
  text: string;
  bytesRead: number;
  truncated: boolean;
}

export async function runGatewayCall(
  params: unknown,
  context: GatewayCallContext
): Promise<GatewayCallOutput> {
  const input = objectParams(params);
  const skillName = stringParam(input, 'skill');
  const method = httpMethod(input['method']);
  const url = parsePublicHttpUrl(stringParam(input, 'url'));
  if (url.protocol !== 'https:') throw new Error('gateway_requires_https');
  await assertPublicNetworkTarget(url);

  const loader = new SkillLoader({ vaultPath: context.vaultPath });
  const skills = await loader.load();
  const skill = skills.find((item) => item.name.toLowerCase() === skillName.toLowerCase());
  if (!skill) throw new Error(`skill_not_found:${skillName}`);

  const config = await readSkillRuntimeConfig(path.dirname(skill.path), skill.name);
  const headers = {
    ...literalHeaders(input['headers']),
    ...secretHeaders(input['env_headers'], skill.requires.env ?? [], config)
  };
  const { body, contentType } = requestBody(input);
  if (contentType && !hasHeader(headers, 'content-type')) headers['content-type'] = contentType;

  const maxChars = clampInteger(numberParam(input['max_chars'], 12_000), 1_000, 40_000);
  const response = await fetchTextWithLimit(url, {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
    maxBytes: Math.max(64_000, maxChars * 8),
    timeoutMs: 30_000
  });
  const clipped = clipText(response.text.trim(), maxChars);
  return {
    skill: skill.name,
    url: url.toString(),
    finalUrl: response.finalUrl,
    method,
    status: response.status,
    ok: response.ok,
    contentType: response.contentType,
    text: clipped.text,
    bytesRead: response.bytesRead,
    truncated: response.truncated || clipped.truncated
  };
}

function objectParams(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('invalid_params:object_required');
  return value as Record<string, unknown>;
}

function stringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`invalid_params:${key}_required`);
  return value.trim();
}

function numberParam(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

function httpMethod(value: unknown): string {
  if (value === undefined) return 'GET';
  if (value === 'GET' || value === 'POST' || value === 'PUT' || value === 'PATCH' || value === 'DELETE') {
    return value;
  }
  throw new Error(`invalid_http_method:${String(value)}`);
}

function literalHeaders(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_params:headers_object_required');
  }
  const out: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const name = normalizeHeaderName(rawName);
    if (!name) continue;
    if (isSecretHeaderName(name)) {
      throw new Error(`secret_header_requires_env_headers:${name}`);
    }
    if (typeof rawValue === 'string' && rawValue.trim()) out[name] = rawValue.trim();
  }
  return out;
}

function secretHeaders(
  value: unknown,
  requiredEnv: readonly string[],
  config: Parameters<typeof resolveSkillEnvValue>[1]
): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_params:env_headers_object_required');
  }
  const out: Record<string, string> = {};
  for (const [rawHeaderName, rawEnvName] of Object.entries(value as Record<string, unknown>)) {
    const headerName = normalizeHeaderName(rawHeaderName);
    if (!headerName) continue;
    if (typeof rawEnvName !== 'string' || !rawEnvName.trim()) {
      throw new Error(`invalid_env_header:${rawHeaderName}`);
    }
    const envName = rawEnvName.trim().toUpperCase();
    const value = resolveSkillEnvValue(envName, config, requiredEnv);
    if (!value) throw new Error(`skill_env_missing:${envName}`);
    out[headerName] = value;
  }
  return out;
}

function requestBody(input: Record<string, unknown>): { body?: string; contentType?: string } {
  const hasJson = input['body_json'] !== undefined;
  const hasText = typeof input['body_text'] === 'string';
  if (hasJson && hasText) throw new Error('invalid_params:body_json_and_body_text_conflict');
  if (hasJson) return { body: JSON.stringify(input['body_json']), contentType: 'application/json' };
  if (hasText) return { body: input['body_text'] as string };
  return {};
}

function normalizeHeaderName(value: string): string {
  const name = value.trim();
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+(?:-[A-Za-z0-9!#$%&'*+.^_`|~-]+)*$/.test(name)) {
    throw new Error(`invalid_header_name:${value}`);
  }
  return name;
}

function isSecretHeaderName(name: string): boolean {
  return /authorization|api[-_]?key|token|secret|client[-_]?id/i.test(name);
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase();
  return Object.keys(headers).some((header) => header.toLowerCase() === target);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return min;
  return Math.max(min, Math.min(max, value));
}
