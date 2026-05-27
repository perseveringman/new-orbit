import type { QuickCaptureSuggestionAction } from './capture';

export function quickCaptureActionLabel(action: QuickCaptureSuggestionAction): string {
  if (action === 'save_to_library') return '保存到资料库';
  if (action === 'bookmark') return '收藏书签';
  if (action === 'create_task') return '创建任务';
  if (action === 'transcribe_voice') return '标记待转写';
  return '标记稍后提炼';
}

export function quickCaptureActionDetail(action: QuickCaptureSuggestionAction): string {
  if (action === 'save_to_library') return '进入资料库，作为可阅读和提炼的源材料。';
  if (action === 'bookmark') return '进入资料库书签，作为可复用参考。';
  if (action === 'create_task') return '进入收件箱，等待分配到项目。';
  if (action === 'transcribe_voice') return '为语音日志加上待转写标记。';
  return '为捕获笔记加上待提炼标记。';
}

export function quickCaptureActionTag(action: QuickCaptureSuggestionAction): string | null {
  if (action === 'distill_later') return '待提炼';
  if (action === 'transcribe_voice') return '待转写';
  return null;
}

export function quickCaptureSuggestionStableId(
  action: QuickCaptureSuggestionAction,
  params?: Record<string, unknown>
): string {
  const target = stableTargetForAction(action, params);
  return target ? `${action}:${target}` : action;
}

function stableTargetForAction(
  action: QuickCaptureSuggestionAction,
  params?: Record<string, unknown>
): string {
  if (action === 'save_to_library' || action === 'bookmark') {
    const url = typeof params?.['url'] === 'string' ? params['url'].trim() : '';
    return canonicalUrl(url);
  }
  return '';
}

function canonicalUrl(value: string): string {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value;
  }
}
