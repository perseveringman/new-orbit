import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  bracketMatching,
  syntaxHighlighting,
  defaultHighlightStyle
} from '@codemirror/language';

/**
 * Thin CodeMirror 6 wrapper used by TaskEditor to host per-section
 * editors. Reuses the same setup as `MarkdownEditor` minus the gutters,
 * wikilink plugin, and file-store integration: each instance is fully
 * controlled by the caller via `value` / `onChange`.
 *
 * `onBlur` fires after the editor loses focus so callers can flush any
 * debounced save eagerly.
 */
interface Props {
  value: string;
  onChange(next: string): void;
  onBlur?(): void;
  dark?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: number;
}

export function MiniMarkdownEditor({
  value,
  onChange,
  onBlur,
  dark,
  readOnly,
  placeholder,
  minHeight = 80
}: Props): JSX.Element {
  const host = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeComp = useRef(new Compartment());
  const readOnlyComp = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        bracketMatching(),
        highlightActiveLine(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        markdown(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        themeComp.current.of(dark ? oneDark : []),
        readOnlyComp.current.of(EditorState.readOnly.of(!!readOnly)),
        EditorView.theme({
          '&': { fontSize: '13px' },
          '.cm-content': { minHeight: `${minHeight}px`, padding: '6px 8px' },
          '.cm-scroller': {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
          }
        }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          onChangeRef.current(u.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          blur() {
            onBlurRef.current?.();
            return false;
          }
        })
      ]
    });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Initial mount only — subsequent prop changes are pushed via dispatches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external value changes without wrecking the user's cursor when
  // they match the current document.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value }
    });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeComp.current.reconfigure(dark ? oneDark : [])
    });
  }, [dark]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyComp.current.reconfigure(
        EditorState.readOnly.of(!!readOnly)
      )
    });
  }, [readOnly]);

  return (
    <div
      ref={host}
      data-placeholder={placeholder}
      className="rounded border border-neutral-200 bg-white/60 dark:border-neutral-800 dark:bg-neutral-950/40"
    />
  );
}
