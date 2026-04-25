import { create } from 'zustand';
import type { ConversationTurn, TaskConversation } from '@shared/orchestration';

interface TaskConversationState {
  conversations: Record<string, TaskConversation>;
  loading: Record<string, boolean>;
  sending: Record<string, boolean>;
  unsubscribe: (() => void) | null;
  init(): void;
  teardown(): void;
  load(taskId: string): Promise<void>;
  send(taskId: string, message: string): Promise<void>;
  ingestTurn(taskId: string, turn: ConversationTurn): void;
}

function upsertTurn(conversation: TaskConversation, turn: ConversationTurn): TaskConversation {
  if (conversation.turns.some((entry) => entry.id === turn.id)) return conversation;
  return {
    ...conversation,
    turns: [...conversation.turns, turn],
    updatedAt: turn.createdAt
  };
}

export const useTaskConversation = create<TaskConversationState>((set, get) => ({
  conversations: {},
  loading: {},
  sending: {},
  unsubscribe: null,
  init() {
    if (typeof window === 'undefined' || get().unsubscribe) return;
    const off = window.orbit.conversation.onEvent(({ taskId, turn }) => {
      get().ingestTurn(taskId, turn);
    });
    set({ unsubscribe: off });
  },
  teardown() {
    get().unsubscribe?.();
    set({ unsubscribe: null });
  },
  async load(taskId) {
    if (typeof window === 'undefined') return;
    set((state) => ({ loading: { ...state.loading, [taskId]: true } }));
    try {
      const conversation = await window.orbit.conversation.get(taskId);
      set((state) => {
        const conversations = { ...state.conversations };
        if (conversation) conversations[taskId] = conversation;
        else delete conversations[taskId];
        return { conversations };
      });
    } finally {
      set((state) => ({ loading: { ...state.loading, [taskId]: false } }));
    }
  },
  async send(taskId, message) {
    if (typeof window === 'undefined') return;
    set((state) => ({ sending: { ...state.sending, [taskId]: true } }));
    try {
      await window.orbit.conversation.send(taskId, message);
      const conversation = await window.orbit.conversation.get(taskId);
      if (conversation) {
        set((state) => ({
          conversations: { ...state.conversations, [taskId]: conversation }
        }));
      }
    } finally {
      set((state) => ({ sending: { ...state.sending, [taskId]: false } }));
    }
  },
  ingestTurn(taskId, turn) {
    set((state) => ({
      conversations: state.conversations[taskId]
        ? {
            ...state.conversations,
            [taskId]: upsertTurn(state.conversations[taskId], turn)
          }
        : state.conversations
    }));
  }
}));
