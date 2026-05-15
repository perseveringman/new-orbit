import { useEffect, useRef } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting
} from '@codemirror/language';
import { Compartment, EditorState, type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  highlightActiveLine,
  keymap,
  placeholder as editorPlaceholder,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';

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
  onBlur?(): void;
}

type InlineDecoration = {
  from: number;
  to: number;
  decoration: Decoration;
};

type ReservedRange = {
  from: number;
  to: number;
};

type LineDecorationOptions = {
  revealSyntax: boolean;
};

const hiddenToken = Decoration.replace({});
const headingLine = (level: number): Decoration =>
  Decoration.line({ class: `cm-md-live-heading cm-md-live-heading-${level}` });
const quoteLine = Decoration.line({ class: 'cm-md-live-quote' });
const taskLine = Decoration.line({ class: 'cm-md-live-task' });
const strongMark = Decoration.mark({ class: 'cm-md-live-strong' });
const emphasisMark = Decoration.mark({ class: 'cm-md-live-emphasis' });
const inlineCodeMark = Decoration.mark({ class: 'cm-md-live-inline-code' });

const STRONG_RE = /(\*\*|__)([^*_][\s\S]*?)\1/g;
const EMPHASIS_RE = /(\*|_)([^*_][^*_]*?)\1/g;
const INLINE_CODE_RE = /`([^`\n]+?)`/g;
const LINK_RE = /\[([^\]\n]+?)\]\(([^)\n]+?)\)/g;
const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g;

export function MarkdownLiveEditor({
  value,
  onChange,
  mode,
  dark = false,
  readOnly = false,
  placeholder,
  className,
  minHeight = 320,
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
      previewComp.current.of(mode === 'live' ? livePreviewExtension() : []),
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
        previewComp.current.reconfigure(mode === 'live' ? livePreviewExtension() : []),
        themeComp.current.reconfigure(editorTheme(dark, mode, minHeight)),
        darkComp.current.reconfigure(dark ? oneDark : [])
      ]
    });
  }, [dark, minHeight, mode]);

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

function livePreviewExtension(): Extension {
  return [
    ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildLivePreviewDecorations(view);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildLivePreviewDecorations(update.view);
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

function buildLivePreviewDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const activeLines = selectedLineNumbers(view);
  const frontmatter = frontmatterRange(view.state);

  if (frontmatter && !rangeTouchesActiveLine(view, frontmatter.from, frontmatter.to, activeLines)) {
    const lines = view.state.doc.lineAt(frontmatter.to).number - view.state.doc.lineAt(frontmatter.from).number + 1;
    builder.add(
      frontmatter.from,
      frontmatter.to,
      Decoration.replace({ block: true, widget: new FrontmatterWidget(lines) })
    );
  }

  for (const range of view.visibleRanges) {
    let line = view.state.doc.lineAt(range.from);
    while (line.from <= range.to) {
      const active = activeLines.has(line.number);
      const insideFoldedFrontmatter =
        !!frontmatter &&
        !rangeTouchesActiveLine(view, frontmatter.from, frontmatter.to, activeLines) &&
        line.from >= frontmatter.from &&
        line.to <= frontmatter.to;

      if (!insideFoldedFrontmatter) {
        addLineDecorations(builder, line.from, line.text, { revealSyntax: active });
      }

      if (line.to >= range.to || line.number >= view.state.doc.lines) break;
      line = view.state.doc.line(line.number + 1);
    }
  }

  return builder.finish();
}

function selectedLineNumbers(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const start = view.state.doc.lineAt(range.from).number;
    const end = view.state.doc.lineAt(range.to).number;
    for (let line = start; line <= end; line += 1) {
      lines.add(line);
    }
  }
  return lines;
}

function rangeTouchesActiveLine(view: EditorView, from: number, to: number, activeLines: Set<number>): boolean {
  const start = view.state.doc.lineAt(from).number;
  const end = view.state.doc.lineAt(to).number;
  for (let line = start; line <= end; line += 1) {
    if (activeLines.has(line)) return true;
  }
  return false;
}

function frontmatterRange(state: EditorState): { from: number; to: number } | null {
  if (state.doc.lines < 3) return null;
  const first = state.doc.line(1);
  if (first.text.trim() !== '---') return null;

  const max = Math.min(state.doc.lines, 80);
  for (let lineNo = 2; lineNo <= max; lineNo += 1) {
    const line = state.doc.line(lineNo);
    if (line.text.trim() === '---') {
      return { from: first.from, to: line.to };
    }
  }
  return null;
}

function addLineDecorations(
  builder: RangeSetBuilder<Decoration>,
  lineFrom: number,
  text: string,
  options: LineDecorationOptions
): void {
  const inline: InlineDecoration[] = [];
  const reserved: ReservedRange[] = [];
  const { revealSyntax } = options;

  const heading = /^(#{1,6})(\s+)/.exec(text);
  if (heading?.[1]) {
    const level = heading[1].length;
    builder.add(lineFrom, lineFrom, headingLine(level));
    if (!revealSyntax) {
      inline.push({
        from: lineFrom,
        to: lineFrom + heading[0].length,
        decoration: hiddenToken
      });
      reserve(reserved, 0, heading[0].length);
    }
  }

  const quote = /^>\s?/.exec(text);
  if (quote) {
    builder.add(lineFrom, lineFrom, quoteLine);
    if (!revealSyntax && tryReserve(reserved, 0, quote[0].length)) {
      inline.push({
        from: lineFrom,
        to: lineFrom + quote[0].length,
        decoration: hiddenToken
      });
    }
  }

  const task = /^(\s*[-*+]\s+)\[([ xX])\]/.exec(text);
  if (task?.[1] && task[2]) {
    builder.add(lineFrom, lineFrom, taskLine);
    const checkboxFrom = task[1].length;
    if (!revealSyntax && tryReserve(reserved, checkboxFrom, checkboxFrom + 3)) {
      inline.push({
        from: lineFrom + checkboxFrom,
        to: lineFrom + checkboxFrom + 3,
        decoration: Decoration.replace({
          widget: new TaskCheckboxWidget(task[2].toLowerCase() === 'x', lineFrom + checkboxFrom)
        })
      });
    }
  }

  addRegexInline(inline, reserved, lineFrom, text, INLINE_CODE_RE, (match) => {
    const start = match.index;
    const end = start + match[0].length;
    const innerFrom = start + 1;
    const innerTo = end - 1;
    if (revealSyntax) {
      return [{ from: lineFrom + start, to: lineFrom + end, decoration: inlineCodeMark }];
    }
    return [
      { from: lineFrom + start, to: lineFrom + innerFrom, decoration: hiddenToken },
      { from: lineFrom + innerFrom, to: lineFrom + innerTo, decoration: inlineCodeMark },
      { from: lineFrom + innerTo, to: lineFrom + end, decoration: hiddenToken }
    ];
  });

  addRegexInline(inline, reserved, lineFrom, text, LINK_RE, (match) => {
    const start = match.index;
    const end = start + match[0].length;
    const label = match[1] ?? '';
    const labelFrom = start + 1;
    const labelTo = labelFrom + label.length;
    if (revealSyntax) {
      return [
        {
          from: lineFrom + start,
          to: lineFrom + end,
          decoration: Decoration.mark({
            class: 'cm-md-live-link',
            attributes: { 'data-md-target': match[2] ?? '' }
          })
        }
      ];
    }
    return [
      { from: lineFrom + start, to: lineFrom + labelFrom, decoration: hiddenToken },
      {
        from: lineFrom + labelFrom,
        to: lineFrom + labelTo,
        decoration: Decoration.mark({
          class: 'cm-md-live-link',
          attributes: { 'data-md-target': match[2] ?? '' }
        })
      },
      { from: lineFrom + labelTo, to: lineFrom + end, decoration: hiddenToken }
    ];
  });

  addRegexInline(inline, reserved, lineFrom, text, WIKILINK_RE, (match) => {
    const start = match.index;
    const end = start + match[0].length;
    const inner = match[1] ?? '';
    const pipe = inner.indexOf('|');
    const visibleStart = pipe === -1 ? start + 2 : start + 2 + pipe + 1;
    const visibleEnd = end - 2;
    if (revealSyntax) {
      return [
        {
          from: lineFrom + start,
          to: lineFrom + end,
          decoration: Decoration.mark({
            class: 'cm-md-live-wikilink',
            attributes: { 'data-md-target': pipe === -1 ? inner : inner.slice(0, pipe) }
          })
        }
      ];
    }
    return [
      { from: lineFrom + start, to: lineFrom + visibleStart, decoration: hiddenToken },
      {
        from: lineFrom + visibleStart,
        to: lineFrom + visibleEnd,
        decoration: Decoration.mark({
          class: 'cm-md-live-wikilink',
          attributes: { 'data-md-target': pipe === -1 ? inner : inner.slice(0, pipe) }
        })
      },
      { from: lineFrom + visibleEnd, to: lineFrom + end, decoration: hiddenToken }
    ];
  });

  addRegexInline(inline, reserved, lineFrom, text, STRONG_RE, (match) => {
    const marker = match[1]?.length ?? 2;
    const start = match.index;
    const end = start + match[0].length;
    if (revealSyntax) {
      return [{ from: lineFrom + start + marker, to: lineFrom + end - marker, decoration: strongMark }];
    }
    return [
      { from: lineFrom + start, to: lineFrom + start + marker, decoration: hiddenToken },
      { from: lineFrom + start + marker, to: lineFrom + end - marker, decoration: strongMark },
      { from: lineFrom + end - marker, to: lineFrom + end, decoration: hiddenToken }
    ];
  });

  addRegexInline(inline, reserved, lineFrom, text, EMPHASIS_RE, (match) => {
    const start = match.index;
    const end = start + match[0].length;
    if (revealSyntax) {
      return [{ from: lineFrom + start + 1, to: lineFrom + end - 1, decoration: emphasisMark }];
    }
    return [
      { from: lineFrom + start, to: lineFrom + start + 1, decoration: hiddenToken },
      { from: lineFrom + start + 1, to: lineFrom + end - 1, decoration: emphasisMark },
      { from: lineFrom + end - 1, to: lineFrom + end, decoration: hiddenToken }
    ];
  });

  inline
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .forEach((item) => builder.add(item.from, item.to, item.decoration));
}

function addRegexInline(
  inline: InlineDecoration[],
  reserved: ReservedRange[],
  lineFrom: number,
  text: string,
  regex: RegExp,
  build: (match: RegExpExecArray) => InlineDecoration[]
): void {
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const localFrom = match.index;
    const localTo = localFrom + match[0].length;
    if (!tryReserve(reserved, localFrom, localTo)) continue;
    inline.push(...build(match));

    if (match[0].length === 0) regex.lastIndex += 1;
  }
}

function tryReserve(reserved: ReservedRange[], from: number, to: number): boolean {
  if (to <= from) return false;
  if (reserved.some((range) => from < range.to && to > range.from)) return false;
  reserve(reserved, from, to);
  return true;
}

function reserve(reserved: ReservedRange[], from: number, to: number): void {
  reserved.push({ from, to });
}

class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly pos: number
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos;
  }

  toDOM(): HTMLElement {
    const box = document.createElement('span');
    box.className = `cm-md-taskbox ${this.checked ? 'cm-md-taskbox-checked' : ''}`;
    box.dataset.pos = String(this.pos);
    box.setAttribute('role', 'checkbox');
    box.setAttribute('aria-checked', String(this.checked));
    box.textContent = this.checked ? 'x' : '';
    return box;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class FrontmatterWidget extends WidgetType {
  constructor(private readonly lines: number) {
    super();
  }

  eq(other: FrontmatterWidget): boolean {
    return other.lines === this.lines;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-md-frontmatter';
    wrapper.textContent = `${this.lines} metadata lines`;
    return wrapper;
  }
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

const livePreviewTheme = EditorView.baseTheme({
  '.cm-md-live-heading': {
    fontWeight: '700',
    letterSpacing: '0'
  },
  '.cm-md-live-heading-1': {
    fontSize: '1.65em',
    lineHeight: '1.55',
    marginTop: '0.35em'
  },
  '.cm-md-live-heading-2': {
    fontSize: '1.36em',
    lineHeight: '1.55',
    marginTop: '0.32em'
  },
  '.cm-md-live-heading-3': {
    fontSize: '1.18em',
    lineHeight: '1.55',
    marginTop: '0.25em'
  },
  '.cm-md-live-heading-4, .cm-md-live-heading-5, .cm-md-live-heading-6': {
    fontSize: '1.05em',
    lineHeight: '1.55',
    marginTop: '0.2em'
  },
  '.cm-md-live-quote': {
    borderLeft: '3px solid #d4d4d4',
    color: '#525252',
    paddingLeft: '12px'
  },
  '.cm-md-live-task': {
    paddingLeft: '2px'
  },
  '.cm-md-live-strong': {
    fontWeight: '700'
  },
  '.cm-md-live-emphasis': {
    fontStyle: 'italic'
  },
  '.cm-md-live-inline-code': {
    border: '1px solid #e5e5e5',
    borderRadius: '4px',
    backgroundColor: '#f5f5f5',
    color: '#262626',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '0.92em',
    padding: '1px 4px'
  },
  '.cm-md-live-link, .cm-md-live-wikilink': {
    color: '#2563eb',
    textDecoration: 'underline',
    textUnderlineOffset: '2px'
  },
  '.cm-md-taskbox': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '14px',
    height: '14px',
    marginRight: '6px',
    border: '1px solid #a3a3a3',
    borderRadius: '3px',
    color: '#ffffff',
    fontSize: '10px',
    lineHeight: '1',
    verticalAlign: '-1px',
    cursor: 'pointer'
  },
  '.cm-md-taskbox-checked': {
    borderColor: '#059669',
    backgroundColor: '#059669'
  },
  '.cm-md-frontmatter': {
    margin: '4px 0 14px',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: '#fafafa',
    color: '#737373',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '12px',
    padding: '7px 9px'
  },
  '.dark & .cm-md-live-quote': {
    borderLeftColor: '#525252',
    color: '#d4d4d4'
  },
  '.dark & .cm-md-live-inline-code': {
    borderColor: '#404040',
    backgroundColor: '#171717',
    color: '#e5e5e5'
  },
  '.dark & .cm-md-live-link, .dark & .cm-md-live-wikilink': {
    color: '#93c5fd'
  },
  '.dark & .cm-md-frontmatter': {
    borderColor: '#262626',
    backgroundColor: '#171717',
    color: '#a3a3a3'
  }
});
