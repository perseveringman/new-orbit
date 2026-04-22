import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
  defaultHighlightStyle
} from '@codemirror/language';
import { useFiles } from '../../store/files';
import { wikilinkExtension, wikilinkTheme } from './wikilinkExt';

interface Props {
  onOpenWikilink: (target: string) => void;
  dark: boolean;
}

export function MarkdownEditor({ onOpenWikilink, dark }: Props): JSX.Element {
  const host = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimer = useRef<number | null>(null);

  const active = useFiles((s) => s.active);
  const setContent = useFiles((s) => s.setContent);
  const save = useFiles((s) => s.save);

  useEffect(() => {
    if (!host.current || !active) {
      viewRef.current?.destroy();
      viewRef.current = null;
      if (host.current) host.current.innerHTML = '';
      return;
    }

    const state = EditorState.create({
      doc: active.content,
      extensions: [
        lineNumbers(),
        foldGutter(),
        history(),
        bracketMatching(),
        highlightActiveLine(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        markdown(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
        wikilinkExtension(onOpenWikilink),
        wikilinkTheme,
        dark ? oneDark : [],
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px' },
          '.cm-scroller': {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
          }
        }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          const text = u.state.doc.toString();
          setContent(text);
          if (saveTimer.current) window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => {
            void save();
          }, 500);
        }),
        EditorView.domEventHandlers({
          blur() {
            void save();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.path, dark]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !active) return;
    if (!active.dirty && view.state.doc.toString() !== active.content) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: active.content }
      });
    }
  }, [active]);

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Select a file to start editing.
      </div>
    );
  }

  return <div ref={host} className="h-full w-full overflow-auto" />;
}
