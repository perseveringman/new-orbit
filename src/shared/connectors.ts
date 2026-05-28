import type { EvidenceContentView, EvidenceFingerprint, EvidencePrivacy, EvidenceSourceKind } from './evidence';

export const CONNECTOR_CATEGORIES = [
  'knowledge',
  'communication',
  'code',
  'calendar',
  'media',
  'automation',
  'generic'
] as const;

export const CONNECTOR_CAPABILITIES = [
  'list',
  'read',
  'search',
  'index',
  'open_original',
  'write_proposals'
] as const;

export const CONNECTOR_STATUSES = ['disconnected', 'connected', 'error'] as const;

export type ConnectorCategory = (typeof CONNECTOR_CATEGORIES)[number];
export type ConnectorCapability = (typeof CONNECTOR_CAPABILITIES)[number];
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];
export type ConnectorEvidenceKind = Extract<EvidenceSourceKind, 'external_file' | 'external_ai_session'>;

export interface ConnectorDefinition {
  id: string;
  display_name: string;
  description: string;
  category: ConnectorCategory;
  capabilities: ConnectorCapability[];
  evidence_kind?: ConnectorEvidenceKind;
  config_schema: ConnectorConfigField[];
  built_in: boolean;
}

export interface ConnectorConfigField {
  key: string;
  label: string;
  type: 'string' | 'directory' | 'boolean' | 'number' | 'select';
  required?: boolean;
  description?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface ConnectorConnection {
  id: string;
  connector_id: string;
  display_name: string;
  enabled: boolean;
  status: ConnectorStatus;
  connected_at: string;
  updated_at: string;
  last_scanned_at?: string;
  item_count: number;
  error?: string;
  config: Record<string, unknown>;
  privacy: EvidencePrivacy;
}

export interface ConnectConnectorInput {
  connector_id: string;
  display_name?: string;
  enabled?: boolean;
  config: Record<string, unknown>;
  privacy?: Partial<EvidencePrivacy>;
}

export interface UpdateConnectorInput {
  display_name?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
  privacy?: Partial<EvidencePrivacy>;
}

export interface ConnectorDocument {
  connection_id: string;
  connector_id: string;
  doc_ref: string;
  title: string;
  canonical_ref: string;
  updated_at: string;
  fingerprint: EvidenceFingerprint;
  evidence_kind?: ConnectorEvidenceKind;
  excerpt?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorDocumentContent {
  document: ConnectorDocument;
  content_markdown: string;
}

export interface ConnectorSearchHit {
  connection_id: string;
  connector_id: string;
  doc_ref: string;
  title: string;
  excerpt: string;
  score: number;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorScanResult {
  connection: ConnectorConnection;
  item_count: number;
  scanned_at: string;
}

export interface ConnectorReadInput {
  connection_id: string;
  doc_ref: string;
  content_view?: EvidenceContentView;
}

export interface ConnectorOpenInput {
  connection_id: string;
  doc_ref: string;
}

export interface ConnectorDirectoryPickResult {
  canceled: boolean;
  path?: string;
}

export interface ConnectorChangeEvent {
  type: 'connector.connected' | 'connector.updated' | 'connector.removed' | 'connector.scanned';
  connection?: ConnectorConnection;
  connection_id?: string;
}

export function defaultConnectorPrivacy(patch: Partial<EvidencePrivacy> = {}): EvidencePrivacy {
  return {
    index_level: patch.index_level ?? 'safe_projection',
    allow_synthesis: patch.allow_synthesis ?? true,
    allow_tool_outputs: patch.allow_tool_outputs ?? false,
    redaction_profile: patch.redaction_profile ?? 'default'
  };
}
