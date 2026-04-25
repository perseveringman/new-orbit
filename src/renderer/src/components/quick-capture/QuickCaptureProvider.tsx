import { useEffect, useState } from 'react';
import { useFiles } from '../../store/files';
import { QuickCaptureModal } from './QuickCaptureModal';

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

  async function save(content: string, tags: string[]): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await window.orbit.capture.thought.create({ content, tags, createdFrom: 'quick_capture', actor: 'user' });
      setOpen(false);
      toast('Thought saved to Inbox');
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
      onSave={(content, tags) => void save(content, tags)}
      onClose={() => setOpen(false)}
    />
  );
}
