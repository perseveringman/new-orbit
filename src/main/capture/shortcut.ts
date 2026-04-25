export const QUICK_CAPTURE_ACCELERATOR = 'CmdOrCtrl+Shift+I';

export function isQuickCaptureAccelerator(value: string): boolean {
  return value === QUICK_CAPTURE_ACCELERATOR;
}
