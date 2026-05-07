export interface MobileCaptureManifest {
  schema_version: 1;
  id: string;
  source: 'orbit-mobile-ios';
  source_version: string;
  device_id: string;
  created_at: string;
  captured_at_local: string;
  kind: 'thought' | 'voice' | 'photo' | 'share' | 'mixed';
  content: string;
  tags: string[];
  attachments: MobileCaptureAttachment[];
}

export interface MobileCaptureAttachment {
  type: 'audio' | 'image' | 'file';
  filename: string;
  sha256: string;
  byte_size: number;
  mime: string;
  transcription?: string;
  duration_ms?: number;
}

export interface MobileAckInfo {
  schema_version: 1;
  acked_at: string;
  inbox_item_id: string;
  vault_path: string;
  vault_note_path: string;
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
