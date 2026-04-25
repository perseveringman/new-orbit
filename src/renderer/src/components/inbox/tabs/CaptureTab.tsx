import type { InboxCaptureTab } from '@shared/inbox_renderer';

export interface CaptureTabDescriptor {
  id: InboxCaptureTab;
  label: string;
}

export const CAPTURE_TABS: CaptureTabDescriptor[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'library', label: 'Library' },
  { id: 'thoughts', label: 'Thoughts' }
];
