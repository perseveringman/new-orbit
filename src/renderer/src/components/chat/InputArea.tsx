import { useState, type FormEvent } from 'react';

interface InputAreaProps {
  conversationId: string;
  disabled: boolean;
  placeholder?: string;
  onSubmit: (text: string) => void;
}

export function InputArea({
  conversationId,
  disabled,
  placeholder,
  onSubmit
}: InputAreaProps): JSX.Element {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue('');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-neutral-200 bg-white/80 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950/60"
      data-conversation-id={conversationId}
    >
      <textarea
        className="flex-1 resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm leading-relaxed text-neutral-900 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
        rows={2}
        value={value}
        placeholder={placeholder ?? '输入消息…'}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit(e as unknown as FormEvent);
          }
        }}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        发送
      </button>
    </form>
  );
}
