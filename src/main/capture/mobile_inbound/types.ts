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

export interface MobileAckInfoV2 {
  schema_version: 2;
  acked_at: string;
  artifact_kind: 'note';
  note_id: string;
  note_path: string;
  timeline_event_id: string;
  vault_path: string;
  mac_identity: string;
  orbit_version: string;
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
