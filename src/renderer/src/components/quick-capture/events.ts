export const QUICK_CAPTURE_OPEN_EVENT = 'orbit:open-quick-capture';

export function requestQuickCaptureOpen(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(QUICK_CAPTURE_OPEN_EVENT));
}
