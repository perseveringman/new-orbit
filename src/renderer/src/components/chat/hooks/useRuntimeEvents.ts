import { useEffect, useRef, useState } from 'react';
import type { RuntimeEvent } from '@shared/chat-protocol';

export interface UseRuntimeEventsOptions {
  conversationId: string;
  /** 初始历史事件（来自 Conversation 持久化或回放）。 */
  initial?: RuntimeEvent[];
  /** 订阅源；返回取消订阅函数。 */
  subscribe?: (cb: (ev: RuntimeEvent) => void) => () => void;
  /** 同 conversationId 才计入；缺省匹配全部。 */
  filter?: (ev: RuntimeEvent) => boolean;
}

/**
 * 收敛 RuntimeEvent 流到本地状态；hook 本身不感知 IPC，
 * 由 host 通过 `subscribe` 注入数据源。
 */
export function useRuntimeEvents(options: UseRuntimeEventsOptions): RuntimeEvent[] {
  const { conversationId, initial, subscribe, filter } = options;
  const [events, setEvents] = useState<RuntimeEvent[]>(initial ?? []);
  const lastConvId = useRef(conversationId);

  useEffect(() => {
    if (lastConvId.current !== conversationId) {
      setEvents(initial ?? []);
      lastConvId.current = conversationId;
    }
  }, [conversationId, initial]);

  useEffect(() => {
    if (!subscribe) return;
    const off = subscribe((ev) => {
      if (ev.conversationId && ev.conversationId !== conversationId) return;
      if (filter && !filter(ev)) return;
      setEvents((prev) => [...prev, ev]);
    });
    return off;
  }, [conversationId, subscribe, filter]);

  return events;
}
