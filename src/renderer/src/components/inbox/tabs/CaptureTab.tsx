import type { InboxCaptureTab } from '@shared/inbox_renderer';

export interface CaptureTabDescriptor {
  id: InboxCaptureTab;
  label: string;
}

export const CAPTURE_TABS: CaptureTabDescriptor[] = [
  { id: 'feed', label: '信息流' },
  { id: 'library', label: '资料库' },
  { id: 'thoughts', label: '想法' }
];
