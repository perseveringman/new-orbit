import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

/**
 * Minimal wikilink decoration: highlight `[[...]]` and bind a click handler.
 * We intentionally do not hide brackets — the editor is source-mode in M2.
 */
const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g;

const linkMark = Decoration.mark({ class: 'cm-wikilink' });

function buildDeco(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    WIKILINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKILINK_RE.exec(text))) {
      const start = from + m.index;
      const end = start + m[0].length;
      b.add(start, end, linkMark);
    }
  }
  return b.finish();
}

export function wikilinkExtension(onOpen: (target: string) => void) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDeco(view);
      }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.viewportChanged) this.decorations = buildDeco(u.view);
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown(e: MouseEvent, view) {
          if (!(e.metaKey || e.ctrlKey)) return false;
          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos == null) return false;
          const line = view.state.doc.lineAt(pos);
          const rel = pos - line.from;
          const text = line.text;
          WIKILINK_RE.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = WIKILINK_RE.exec(text))) {
            if (rel >= m.index && rel <= m.index + m[0].length) {
              const inner = m[1] ?? '';
              const pipe = inner.indexOf('|');
              const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
              e.preventDefault();
              onOpen(target);
              return true;
            }
          }
          return false;
        }
      }
    }
  );
  return [plugin];
}

export const wikilinkTheme = EditorView.baseTheme({
  '.cm-wikilink': {
    color: '#60a5fa',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    cursor: 'pointer'
  }
});
