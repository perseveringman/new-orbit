export interface MobileCaptureManifest {
  schema_version: 1;
  id: string;
  source: 'orbit-mobile-ios';
  source_version: string;
  device_id: string;
  created_at: string;
  captured_at_local: string;
  kind: MobileCaptureKind;
  content: string;
  tags: string[];
  attachments: MobileCaptureAttachment[];
  recording?: MobileRecordingInfo;
  derivatives?: MobileDerivativeRef[];
  context?: MobileCaptureContext;
}

export type MobileCaptureKind = 'thought' | 'voice' | 'photo' | 'share' | 'mixed' | 'recording';

export type MobileAttachmentType =
  | 'audio'
  | 'image'
  | 'file'
  | 'transcript'
  | 'transcript-partial'
  | 'derivative';

export interface MobileCaptureAttachment {
  type: MobileAttachmentType;
  filename: string;
  sha256: string;
  byte_size: number;
  mime: string;
  transcription?: string;
  transcription_source?: string;
  duration_ms?: number;
  recorded_at?: string;
  width?: number;
  height?: number;
  captured_at?: string;
  schema?: string;
  derivative_kind?: string;
  template_id?: string;
  sync_hint?: 'wifi_only';
}

export interface MobileRecordingInfo {
  duration_ms: number;
  language_hints: string[];
  speakers: Array<{ id: string; label: string; color?: string }>;
  partial_provider: string;
  final_provider: string;
  diarization_provider?: string | null;
}

export interface MobileDerivativeRef {
  kind: string;
  filename: string;
  template_id?: string;
}

export interface MobileCaptureContext {
  clipboard_hint?: string | null;
  share_context?: MobileShareContext | null;
  location?: Record<string, unknown> | null;
  network?: string | null;
  battery?: number | null;
}

export interface MobileShareContext {
  capture_method?: 'share_extension' | 'clipboard' | 'manual_url' | string;
  source_platform?: 'wechat_article' | 'xiaohongshu' | 'x' | 'web' | 'unknown' | string;
  parser_hint?: 'wechat_article' | 'xiaohongshu_note' | 'x_post' | 'generic_url' | string;
  source_url?: string | null;
  canonical_url?: string | null;
  raw_share_text?: string | null;
  source_title?: string | null;
  origin_app?: string | null;
  enrichment_state?: 'pending' | 'enriched' | 'failed' | string;
}

export type MobileAckInfo = MobileAckInfoV1 | MobileAckInfoV2;

export interface MobileAckInfoV1 {
  schema_version: 1;
  acked_at: string;
  inbox_item_id: string;
  vault_path: string;
  vault_note_path: string;
  mac_identity: string;
  orbit_version: string;
}

export type MobileAckInfoV2 = MobileNoteAckInfoV2 | MobileLibraryAckInfoV2;

export interface MobileAckInfoV2Base {
  schema_version: 2;
  acked_at: string;
  timeline_event_id: string;
  vault_path: string;
  mac_identity: string;
  orbit_version: string;
}

export interface MobileNoteAckInfoV2 extends MobileAckInfoV2Base {
  artifact_kind: 'note';
  note_id: string;
  note_path: string;
}

export interface MobileLibraryAckInfoV2 extends MobileAckInfoV2Base {
  artifact_kind: 'library_item';
  library_item_id: string;
  library_item_path: string;
}

export interface MobileFailedInfo {
  schema_version: 1;
  failed_at: string;
  error_code:
    | 'sha256_mismatch'
    | 'invalid_manifest'
    | 'vault_unavailable'
    | 'fs_error'
    | 'unsupported_schema_version';
  error_message: string;
  retryable: boolean;
  orbit_version: string;
}
