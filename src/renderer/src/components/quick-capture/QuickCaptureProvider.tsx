import { useEffect, useState } from 'react';
import { useFiles } from '../../store/files';
import { QuickCaptureModal, type QuickCapturePayload } from './QuickCaptureModal';

export function QuickCaptureProvider(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useFiles((state) => state.toast);

  useEffect(() => {
    return window.orbit.quickCapture.onOpen(() => {
      setError(null);
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        setError(null);
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function save(payload: QuickCapturePayload): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      if (payload.mode === 'note') {
        await window.orbit.capture.quick.createNote({
          content: payload.content,
          tags: payload.tags,
          specialKind: payload.specialKind,
          attachments: await Promise.all(payload.files.map((file) => attachmentInput(file, 'file'))),
          ...(payload.audioFile
            ? {
                audio: {
                  ...(await attachmentInput(payload.audioFile, 'audio')),
                  durationSec: payload.audioDurationSec
                }
              }
            : {})
        });
        toast(payload.audioFile ? 'Voice note captured' : 'Note captured');
      } else if (payload.mode === 'link') {
        await window.orbit.capture.quick.createLink({
          url: payload.link.url,
          title: payload.link.title,
          kind: payload.link.kind,
          notes: payload.link.notes,
          tags: payload.tags
        });
        toast(payload.link.kind === 'bookmark' ? 'Bookmark saved to Library' : 'Read-later item saved to Library');
      } else {
        await window.orbit.capture.quick.createTask({
          title: payload.task.title,
          details: payload.task.details,
          tags: payload.tags
        });
        toast('Task sent to Inbox');
      }
      setOpen(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <QuickCaptureModal
      open={open}
      saving={saving}
      error={error}
      onSave={(payload) => void save(payload)}
      onClose={() => setOpen(false)}
    />
  );
}

async function attachmentInput(file: File, kind: 'file' | 'audio'): Promise<{ name: string; dataBase64: string; mimeType?: string; kind: 'file' | 'audio' }> {
  return {
    name: file.name,
    dataBase64: await fileToBase64(file),
    ...(file.type ? { mimeType: file.type } : {}),
    kind
  };
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('failed to read file'));
    reader.readAsDataURL(file);
  });
}
