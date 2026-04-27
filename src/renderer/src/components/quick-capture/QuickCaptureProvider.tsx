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

  async function save(content: string, tags: string[], specialKind: string | null): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await window.orbit.notes.create({
        type: 'thought',
        body: content,
        tags,
        ...(specialKind ? { special_marker: markerFor(specialKind) } : {})
      });
      await window.orbit.capture.thought.create({ content, tags, createdFrom: 'quick_capture', actor: 'user' });
      setOpen(false);
      toast('Thought saved to Notes');
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
      onSave={(content, tags, specialKind) => void save(content, tags, specialKind)}
      onClose={() => setOpen(false)}
    />
  );
}

function markerFor(kind: string): { kind: 'insight' | 'breakthrough' | 'setback' | 'milestone' | 'gratitude' | 'reflection'; icon: string } {
  const icons: Record<string, string> = {
    insight: '💡',
    breakthrough: '🌟',
    setback: '💔',
    milestone: '🏁',
    gratitude: '🙏',
    reflection: '🪞'
  };
  return {
    kind: kind as 'insight' | 'breakthrough' | 'setback' | 'milestone' | 'gratitude' | 'reflection',
    icon: icons[kind] ?? '💡'
  };
}
