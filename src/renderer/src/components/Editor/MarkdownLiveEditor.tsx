import { useEffect, useRef, type MutableRefObject } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting
} from '@codemirror/language';
import { Compartment, EditorSelection, EditorState, StateField, type Extension } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  keymap,
  placeholder as editorPlaceholder,
  type DecorationSet,
  ViewPlugin
} from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  buildLivePreviewDecorations,
  livePreviewTheme,
  type MarkdownLivePreviewContext
} from './markdownLivePreview';

export type MarkdownEditorMode = 'live' | 'source';

export interface MarkdownLiveEditorHandle {
  focus(): void;
  insertText(text: string): void;
  deleteBeforeCursor(text: string): boolean;
  currentLineBeforeCursor(): string;
  prefixCurrentLine(prefix: string): void;
}

export type MarkdownLiveEditorKeyCommand =
  | 'mod-1'
  | 'mod-2'
  | 'mod-3'
  | 'mod-4'
  | 'mod-5'
  | 'mod-6'
  | 'mod-7'
  | 'mod-k'
  | 'arrow-down'
  | 'arrow-up'
  | 'enter'
  | 'tab'
  | 'escape';

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
  onPaste?(): void;
  onKeyDown?(event: KeyboardEvent): boolean | void;
  onKeyCommand?(command: MarkdownLiveEditorKeyCommand): boolean | void;
  onModEnter?(): void;
  onEscape?(): void;
  autoFocus?: boolean;
  editorRef?: MutableRefObject<MarkdownLiveEditorHandle | null>;
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
  onBlur,
  onPaste,
  onKeyDown,
  onKeyCommand,
  onModEnter,
  onEscape,
  autoFocus = false,
  editorRef
}: MarkdownLiveEditorProps): JSX.Element {
  const host = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const previewComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());
  const darkComp = useRef(new Compartment());
  const readOnlyComp = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onPasteRef = useRef(onPaste);
  const onKeyDownRef = useRef(onKeyDown);
  const onKeyCommandRef = useRef(onKeyCommand);
  const onModEnterRef = useRef(onModEnter);
  const onEscapeRef = useRef(onEscape);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  onPasteRef.current = onPaste;
  onKeyDownRef.current = onKeyDown;
  onKeyCommandRef.current = onKeyCommand;
  onModEnterRef.current = onModEnter;
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!host.current) return;

    const extensions: Extension[] = [
      history(),
      bracketMatching(),
      highlightActiveLine(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      markdown(),
      keymap.of([
        ...quickCommandKeymap(onKeyCommandRef),
        {
          key: 'Mod-Enter',
          run() {
            const handler = onModEnterRef.current;
            if (!handler) return false;
            handler();
            return true;
          }
        },
        {
          key: 'Escape',
          run() {
            if (onKeyCommandRef.current?.('escape') === true) return true;
            const handler = onEscapeRef.current;
            if (!handler) return false;
            handler();
            return true;
          }
        },
        ...defaultKeymap,
        ...historyKeymap
      ]),
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
        keydown(event) {
          return onKeyDownRef.current?.(event) === true;
        },
        paste() {
          onPasteRef.current?.();
          return false;
        },
        blur() {
          onBlurRef.current?.();
          return false;
        }
      })
    ];

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    if (autoFocus) window.setTimeout(() => view.focus(), 0);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Initial mount only. Prop changes are pushed through compartments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editorRef) return undefined;
    editorRef.current = {
      focus() {
        viewRef.current?.focus();
      },
      insertText(text: string) {
        const view = viewRef.current;
        if (!view) return;
        const range = view.state.selection.main;
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: text },
          selection: EditorSelection.cursor(range.from + text.length)
        });
        view.focus();
      },
      deleteBeforeCursor(text: string) {
        const view = viewRef.current;
        if (!view || !text) return false;
        const cursor = view.state.selection.main.head;
        const from = cursor - text.length;
        if (from < 0 || view.state.doc.sliceString(from, cursor) !== text) return false;
        view.dispatch({
          changes: { from, to: cursor },
          selection: EditorSelection.cursor(from)
        });
        view.focus();
        return true;
      },
      currentLineBeforeCursor() {
        const view = viewRef.current;
        if (!view) return '';
        const cursor = view.state.selection.main.head;
        const line = view.state.doc.lineAt(cursor);
        return view.state.doc.sliceString(line.from, cursor);
      },
      prefixCurrentLine(prefix: string) {
        const view = viewRef.current;
        if (!view) return;
        const marker = `${prefix} `;
        const cursor = view.state.selection.main.head;
        const line = view.state.doc.lineAt(cursor);
        const existingMarker = /^(?:[•\-○x><~^])\s+/.exec(line.text);
        if (existingMarker) {
          view.dispatch({
            changes: { from: line.from, to: line.from + existingMarker[0].length, insert: marker },
            selection: EditorSelection.cursor(line.from + marker.length)
          });
        } else {
          view.dispatch({
            changes: { from: line.from, insert: marker },
            selection: EditorSelection.cursor(cursor + marker.length)
          });
        }
        view.focus();
      }
    };
    return () => {
      editorRef.current = null;
    };
  }, [editorRef]);

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

function quickCommandKeymap(
  ref: MutableRefObject<((command: MarkdownLiveEditorKeyCommand) => boolean | void) | undefined>
): Array<{ key: string; run(): boolean }> {
  function run(command: MarkdownLiveEditorKeyCommand): () => boolean {
    return () => ref.current?.(command) === true;
  }
  return [
    { key: 'Mod-1', run: run('mod-1') },
    { key: 'Mod-2', run: run('mod-2') },
    { key: 'Mod-3', run: run('mod-3') },
    { key: 'Mod-4', run: run('mod-4') },
    { key: 'Mod-5', run: run('mod-5') },
    { key: 'Mod-6', run: run('mod-6') },
    { key: 'Mod-7', run: run('mod-7') },
    { key: 'Mod-k', run: run('mod-k') },
    { key: 'ArrowDown', run: run('arrow-down') },
    { key: 'ArrowUp', run: run('arrow-up') },
    { key: 'Enter', run: run('enter') },
    { key: 'Tab', run: run('tab') }
  ];
}

function livePreviewExtension(context: MarkdownLivePreviewContext): Extension {
  return [
    livePreviewDecorationField(context),
    ViewPlugin.fromClass(class {}, {
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

function livePreviewDecorationField(context: MarkdownLivePreviewContext): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildLivePreviewDecorations(previewDocument(state), context);
    },
    update(decorations, transaction) {
      if (!transaction.docChanged && !transaction.selection) return decorations;
      return buildLivePreviewDecorations(previewDocument(transaction.state), context);
    },
    provide: (field) => EditorView.decorations.from(field)
  });
}

function previewDocument(state: EditorState): { state: EditorState; visibleRanges: readonly { from: number; to: number }[] } {
  return {
    state,
    visibleRanges: [{ from: 0, to: state.doc.length }]
  };
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
