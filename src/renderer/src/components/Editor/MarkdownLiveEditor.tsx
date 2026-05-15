import { useEffect, useRef } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting
} from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  keymap,
  placeholder as editorPlaceholder,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  buildLivePreviewDecorations,
  livePreviewTheme,
  type MarkdownLivePreviewContext
} from './markdownLivePreview';

export type MarkdownEditorMode = 'live' | 'source';

interface MarkdownLiveEditorProps {
  value: string;
  onChange(next: string): void;
  mode: MarkdownEditorMode;
  dark?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  vaultRoot?: string | null;
  notePath?: string;
  onBlur?(): void;
}

export function MarkdownLiveEditor({
  value,
  onChange,
  mode,
  dark = false,
  readOnly = false,
  placeholder,
  className,
  minHeight = 320,
  vaultRoot,
  notePath,
  onBlur
}: MarkdownLiveEditorProps): JSX.Element {
  const host = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const previewComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());
  const darkComp = useRef(new Compartment());
  const readOnlyComp = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  useEffect(() => {
    if (!host.current) return;

    const extensions: Extension[] = [
      history(),
      bracketMatching(),
      highlightActiveLine(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      markdown(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      previewComp.current.of(mode === 'live' ? livePreviewExtension({ vaultRoot, notePath }) : []),
      darkComp.current.of(dark ? oneDark : []),
      themeComp.current.of(editorTheme(dark, mode, minHeight)),
      readOnlyComp.current.of([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly)
      ]),
      placeholder ? editorPlaceholder(placeholder) : [],
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        onChangeRef.current(update.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        blur() {
          onBlurRef.current?.();
          return false;
        }
      })
    ];

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Initial mount only. Prop changes are pushed through compartments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value }
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        previewComp.current.reconfigure(mode === 'live' ? livePreviewExtension({ vaultRoot, notePath }) : []),
        themeComp.current.reconfigure(editorTheme(dark, mode, minHeight)),
        darkComp.current.reconfigure(dark ? oneDark : [])
      ]
    });
  }, [dark, minHeight, mode, notePath, vaultRoot]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyComp.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly)
      ])
    });
  }, [readOnly]);

  return <div ref={host} className={className ?? 'h-full w-full'} />;
}

function livePreviewExtension(context: MarkdownLivePreviewContext): Extension {
  return [
    ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildLivePreviewDecorations(view, context);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildLivePreviewDecorations(update.view, context);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        mousedown(event, view) {
          const target = event.target instanceof HTMLElement ? event.target : null;
          const taskBox = target?.closest<HTMLElement>('.cm-md-taskbox');
          if (taskBox?.dataset.pos) {
            const pos = Number(taskBox.dataset.pos);
            const checked = taskBox.getAttribute('aria-checked') === 'true';
            event.preventDefault();
            view.dispatch({
              changes: { from: pos, to: pos + 3, insert: checked ? '[ ]' : '[x]' }
            });
            return true;
          }

          return false;
        }
      }
    }
    ),
    livePreviewTheme
  ];
}

function editorTheme(dark: boolean, mode: MarkdownEditorMode, minHeight: number): Extension {
  const sourceMode = mode === 'source';
  return EditorView.theme({
    '&': {
      height: '100%',
      minHeight: `${minHeight}px`,
      backgroundColor: dark ? '#0a0a0a' : '#ffffff',
      color: dark ? '#f5f5f5' : '#171717'
    },
    '.cm-scroller': {
      fontFamily: sourceMode
        ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
        : 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      lineHeight: sourceMode ? '1.6' : '1.75'
    },
    '.cm-content': {
      minHeight: `${minHeight}px`,
      padding: '20px 24px',
      caretColor: dark ? '#f5f5f5' : '#171717'
    },
    '.cm-line': {
      padding: sourceMode ? '0 2px' : '1px 2px'
    },
    '.cm-gutters': {
      backgroundColor: dark ? '#0a0a0a' : '#ffffff',
      borderRightColor: dark ? '#262626' : '#e5e5e5'
    },
    '.cm-activeLine': {
      backgroundColor: dark ? 'rgba(64, 64, 64, 0.35)' : 'rgba(245, 245, 245, 0.9)'
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: dark ? 'rgba(96, 165, 250, 0.35)' : 'rgba(147, 197, 253, 0.45)'
    },
    '&.cm-focused': {
      outline: 'none'
    },
    '.cm-placeholder': {
      color: dark ? '#737373' : '#a3a3a3'
    }
  });
}
