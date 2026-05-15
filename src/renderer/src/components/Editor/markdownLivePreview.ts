import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';

export interface MarkdownLivePreviewContext {
  vaultRoot?: string | null;
  notePath?: string;
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

type BlockDecoration = {
  from: number;
  to: number;
  endLine: number;
  decoration: Decoration;
  activeDecoration?: Decoration;
  renderWhenActive?: boolean;
};

type PreviewDocument = {
  state: EditorState;
  visibleRanges: readonly { from: number; to: number }[];
};

type LineDecorationOptions = {
  revealSyntax: boolean;
  context: MarkdownLivePreviewContext;
};

type MediaKind = 'image' | 'audio' | 'video' | 'pdf' | 'file' | 'note';

type MediaEmbed = {
  raw: string;
  label: string;
  target: string;
  title?: string;
  width?: number;
  height?: number;
  kind: MediaKind;
  url: string | null;
};

type TableAlignment = 'left' | 'center' | 'right' | null;

type TableBlock = {
  headers: string[];
  alignments: TableAlignment[];
  rows: string[][];
};

const hiddenToken = Decoration.replace({});
const headingLine = (level: number): Decoration =>
  Decoration.line({ class: `cm-md-live-heading cm-md-live-heading-${level}` });
const quoteLine = Decoration.line({ class: 'cm-md-live-quote' });
const taskLine = Decoration.line({ class: 'cm-md-live-task' });
const listLine = Decoration.line({ class: 'cm-md-live-list' });
const footnoteLine = Decoration.line({ class: 'cm-md-live-footnote-line' });
const strongMark = Decoration.mark({ class: 'cm-md-live-strong' });
const emphasisMark = Decoration.mark({ class: 'cm-md-live-emphasis' });
const strikeMark = Decoration.mark({ class: 'cm-md-live-strike' });
const highlightMark = Decoration.mark({ class: 'cm-md-live-highlight' });
const inlineCodeMark = Decoration.mark({ class: 'cm-md-live-inline-code' });
const inlineMathMark = Decoration.mark({ class: 'cm-md-live-inline-math' });
const tagMark = Decoration.mark({ class: 'cm-md-live-tag' });
const footnoteRefMark = Decoration.mark({ class: 'cm-md-live-footnote-ref' });
const htmlMark = Decoration.mark({ class: 'cm-md-live-html' });

const STRONG_RE = /(\*\*|__)([^*_][\s\S]*?)\1/g;
const EMPHASIS_RE = /(\*|_)([^*_][^*_]*?)\1/g;
const STRIKE_RE = /~~([^~\n][\s\S]*?)~~/g;
const HIGHLIGHT_RE = /==([^=\n][\s\S]*?)==/g;
const INLINE_CODE_RE = /`([^`\n]+?)`/g;
const INLINE_MATH_RE = /\$([^$\n]+?)\$/g;
const IMAGE_RE = /!\[([^\]\n]*?)\]\(([^)\n]+?)\)/g;
const LINK_RE = /\[([^\]\n]+?)\]\(([^)\n]+?)\)/g;
const OBSIDIAN_EMBED_RE = /!\[\[([^\]\n]+?)\]\]/g;
const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g;
const AUTOLINK_RE = /<((?:https?:\/\/|mailto:)[^>\s]+)>/g;
const BARE_URL_RE = /\bhttps?:\/\/[^\s<>()]+/g;
const FOOTNOTE_REF_RE = /\[\^([^\]\n]+?)\]/g;
const TAG_RE = /(^|[\s([{])#([A-Za-z0-9_\-/\u4e00-\u9fff]+)\b/g;
const HTML_INLINE_RE = /<\/?[A-Za-z][^>\n]*>/g;
const INLINE_COMMENT_RE = /%%([^%\n]|%(?!%))*%%/g;

const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp']);
const AUDIO_EXTENSIONS = new Set(['aac', 'aiff', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'weba', 'webm']);
const VIDEO_EXTENSIONS = new Set(['m4v', 'mov', 'mp4', 'mpeg', 'ogv', 'webm']);
const VAULT_RELATIVE_ROOTS = new Set([
  '.orbit',
  '01_Projects',
  '02_Areas',
  '03_Resources',
  '04_Archives',
  'feeds',
  'knowledge-base',
  'library',
  'notes',
  'resources'
]);

export function buildLivePreviewDecorations(
  view: PreviewDocument,
  context: MarkdownLivePreviewContext = {}
): DecorationSet {
  const decorations: InlineDecoration[] = [];
  const activeLines = selectedLineNumbers(view);
  const skippedRanges: ReservedRange[] = [];
  const frontmatter = frontmatterRange(view.state);

  if (frontmatter && !rangeTouchesActiveLine(view, frontmatter.from, frontmatter.to, activeLines)) {
    const lines = view.state.doc.lineAt(frontmatter.to).number - view.state.doc.lineAt(frontmatter.from).number + 1;
    decorations.push({
      from: frontmatter.from,
      to: frontmatter.to,
      decoration: Decoration.replace({ block: true, widget: new FrontmatterWidget(lines) })
    });
    skippedRanges.push(frontmatter);
  }

  collectSetextHeadingDecorations(view, activeLines, decorations, skippedRanges);
  collectBlockDecorations(view, context, activeLines, decorations, skippedRanges);

  for (const range of view.visibleRanges) {
    let line = view.state.doc.lineAt(range.from);
    while (line.from <= range.to) {
      const active = activeLines.has(line.number);
      if (!lineOverlapsRanges(line.from, line.to, skippedRanges)) {
        addLineDecorations(decorations, line.from, line.text, { revealSyntax: active, context });
      }

      if (line.to >= range.to || line.number >= view.state.doc.lines) break;
      line = view.state.doc.line(line.number + 1);
    }
  }

  const builder = new RangeSetBuilder<Decoration>();
  decorations
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .forEach((item) => builder.add(item.from, item.to, item.decoration));
  return builder.finish();
}

function selectedLineNumbers(view: PreviewDocument): Set<number> {
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

function rangeTouchesActiveLine(view: PreviewDocument, from: number, to: number, activeLines: Set<number>): boolean {
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

function collectSetextHeadingDecorations(
  view: PreviewDocument,
  activeLines: Set<number>,
  decorations: InlineDecoration[],
  skippedRanges: ReservedRange[]
): void {
  for (let lineNo = 1; lineNo < view.state.doc.lines; lineNo += 1) {
    const line = view.state.doc.line(lineNo);
    const underline = view.state.doc.line(lineNo + 1);
    if (!line.text.trim()) continue;
    const match = /^ {0,3}(=+|-+)\s*$/.exec(underline.text);
    if (!match) continue;

    const level = match[1]?.startsWith('=') ? 1 : 2;
    decorations.push({ from: line.from, to: line.from, decoration: headingLine(level) });
    if (!activeLines.has(line.number) && !activeLines.has(underline.number)) {
      decorations.push({ from: underline.from, to: underline.to, decoration: hiddenToken });
      skippedRanges.push({ from: underline.from, to: underline.to });
    }
    lineNo += 1;
  }
}

function collectBlockDecorations(
  view: PreviewDocument,
  context: MarkdownLivePreviewContext,
  activeLines: Set<number>,
  decorations: InlineDecoration[],
  skippedRanges: ReservedRange[]
): void {
  const doc = view.state.doc;
  for (let lineNo = 1; lineNo <= doc.lines; lineNo += 1) {
    const line = doc.line(lineNo);
    if (lineOverlapsRanges(line.from, line.to, skippedRanges)) continue;

    const block =
      parseFencedCodeBlock(view, lineNo) ??
      parseMathBlock(view, lineNo) ??
      parseCalloutBlock(view, lineNo) ??
      parseTableBlock(view, lineNo) ??
      parseAttachmentMediaBlock(view, lineNo, context) ??
      parseMediaBlock(view, lineNo, context) ??
      parseHorizontalRuleBlock(view, lineNo) ??
      parseFootnoteBlock(view, lineNo) ??
      parseObsidianCommentBlock(view, lineNo) ??
      parseHtmlBlock(view, lineNo);

    if (!block) continue;
    const active = rangeTouchesActiveLine(view, block.from, block.to, activeLines);
    if (active && block.activeDecoration) {
      decorations.push({ from: block.to, to: block.to, decoration: block.activeDecoration });
    } else if (block.renderWhenActive || !active) {
      decorations.push({ from: block.from, to: block.to, decoration: block.decoration });
      skippedRanges.push({ from: block.from, to: block.to });
    }
    lineNo = block.endLine;
  }
}

function parseFencedCodeBlock(
  view: PreviewDocument,
  lineNo: number
): BlockDecoration | null {
  const doc = view.state.doc;
  const line = doc.line(lineNo);
  const opening = /^ {0,3}(`{3,}|~{3,})\s*([^`]*)$/.exec(line.text);
  if (!opening?.[1]) return null;

  const fence = opening[1];
  const marker = fence[0] ?? '`';
  const fenceLength = fence.length;
  const closingRe = new RegExp(`^ {0,3}${escapeRegExp(marker)}{${fenceLength},}\\s*$`);
  const code: string[] = [];
  let endLine = doc.lines;

  for (let cursor = lineNo + 1; cursor <= doc.lines; cursor += 1) {
    const current = doc.line(cursor);
    if (closingRe.test(current.text)) {
      endLine = cursor;
      break;
    }
    code.push(current.text);
  }

  const end = doc.line(endLine);
  return {
    from: line.from,
    to: end.to,
    endLine,
    decoration: Decoration.replace({
      block: true,
      widget: new CodeBlockWidget((opening[2] ?? '').trim(), code.join('\n'))
    })
  };
}

function parseMathBlock(
  view: PreviewDocument,
  lineNo: number
): BlockDecoration | null {
  const doc = view.state.doc;
  const line = doc.line(lineNo);
  if (line.text.trim() !== '$$') return null;

  const math: string[] = [];
  let endLine = doc.lines;
  for (let cursor = lineNo + 1; cursor <= doc.lines; cursor += 1) {
    const current = doc.line(cursor);
    if (current.text.trim() === '$$') {
      endLine = cursor;
      break;
    }
    math.push(current.text);
  }

  const end = doc.line(endLine);
  return {
    from: line.from,
    to: end.to,
    endLine,
    decoration: Decoration.replace({ block: true, widget: new MathBlockWidget(math.join('\n')) })
  };
}

function parseCalloutBlock(
  view: PreviewDocument,
  lineNo: number
): BlockDecoration | null {
  const doc = view.state.doc;
  const line = doc.line(lineNo);
  const match = /^>\s*\[!([A-Za-z][\w-]*)\]([+-])?\s*(.*)$/.exec(line.text);
  if (!match) return null;

  const body: string[] = [];
  let endLine = lineNo;
  for (let cursor = lineNo + 1; cursor <= doc.lines; cursor += 1) {
    const current = doc.line(cursor);
    if (!/^>\s?/.test(current.text)) break;
    body.push(current.text.replace(/^>\s?/, ''));
    endLine = cursor;
  }

  const end = doc.line(endLine);
  return {
    from: line.from,
    to: end.to,
    endLine,
    decoration: Decoration.replace({
      block: true,
      widget: new CalloutWidget(match[1] ?? 'note', match[3] ?? '', body.join('\n'))
    })
  };
}

function parseTableBlock(
  view: PreviewDocument,
  lineNo: number
): BlockDecoration | null {
  const doc = view.state.doc;
  if (lineNo >= doc.lines) return null;
  const headerLine = doc.line(lineNo);
  const separatorLine = doc.line(lineNo + 1);
  if (!looksLikeTableRow(headerLine.text) || !isTableSeparator(separatorLine.text)) return null;

  const table: TableBlock = {
    headers: splitTableRow(headerLine.text),
    alignments: parseTableAlignments(separatorLine.text),
    rows: []
  };

  let endLine = lineNo + 1;
  for (let cursor = lineNo + 2; cursor <= doc.lines; cursor += 1) {
    const current = doc.line(cursor);
    if (!looksLikeTableRow(current.text)) break;
    table.rows.push(splitTableRow(current.text));
    endLine = cursor;
  }

  const end = doc.line(endLine);
  return {
    from: headerLine.from,
    to: end.to,
    endLine,
    decoration: Decoration.replace({ block: true, widget: new TableWidget(table) })
  };
}

function parseAttachmentMediaBlock(
  view: PreviewDocument,
  lineNo: number,
  context: MarkdownLivePreviewContext
): BlockDecoration | null {
  const line = view.state.doc.line(lineNo);
  const list = /^(\s*(?:[-*+]|\d+[.)])\s+)(.+)$/.exec(line.text);
  if (!list?.[2]) return null;

  const content = list[2].trim();
  const embeds = mediaEmbedsFromText(content, context).filter((embed) =>
    embed.kind === 'image' || embed.kind === 'audio' || embed.kind === 'video' || embed.kind === 'pdf'
  );
  if (embeds.length === 0) return null;

  const caption = contentWithoutMediaSyntax(content).replace(/^[：:]\s*/, '').trim();
  return {
    from: line.from,
    to: line.to,
    endLine: lineNo,
    decoration: Decoration.replace({
      block: true,
      widget: new AttachmentMediaWidget(embeds, caption)
    }),
    activeDecoration: Decoration.widget({
      side: 1,
      widget: new AttachmentMediaWidget(embeds, caption)
    })
  };
}

function parseMediaBlock(
  view: PreviewDocument,
  lineNo: number,
  context: MarkdownLivePreviewContext
): BlockDecoration | null {
  const line = view.state.doc.line(lineNo);
  const embeds = parseOnlyMediaEmbeds(line.text.trim(), context);
  if (!embeds.length) return null;
  return {
    from: line.from,
    to: line.to,
    endLine: lineNo,
    decoration: Decoration.replace({ block: true, widget: new MediaGroupWidget(embeds) }),
    activeDecoration: Decoration.widget({
      side: 1,
      widget: new MediaGroupWidget(embeds)
    })
  };
}

function parseHorizontalRuleBlock(
  view: PreviewDocument,
  lineNo: number
): BlockDecoration | null {
  const line = view.state.doc.line(lineNo);
  if (!/^ {0,3}(([-*_])\s*){3,}$/.test(line.text)) return null;
  if (lineNo > 1 && view.state.doc.line(lineNo - 1).text.trim()) return null;
  return {
    from: line.from,
    to: line.to,
    endLine: lineNo,
    decoration: Decoration.replace({ block: true, widget: new HorizontalRuleWidget() })
  };
}

function parseFootnoteBlock(
  view: PreviewDocument,
  lineNo: number
): BlockDecoration | null {
  const doc = view.state.doc;
  const line = doc.line(lineNo);
  const match = /^\[\^([^\]\n]+)\]:\s*(.*)$/.exec(line.text);
  if (!match) return null;

  const lines = [match[2] ?? ''];
  let endLine = lineNo;
  for (let cursor = lineNo + 1; cursor <= doc.lines; cursor += 1) {
    const current = doc.line(cursor);
    if (!/^( {2,}|\t)/.test(current.text)) break;
    lines.push(current.text.trim());
    endLine = cursor;
  }

  const end = doc.line(endLine);
  return {
    from: line.from,
    to: end.to,
    endLine,
    decoration: Decoration.replace({
      block: true,
      widget: new FootnoteWidget(match[1] ?? '', lines.join('\n'))
    })
  };
}

function parseObsidianCommentBlock(
  view: PreviewDocument,
  lineNo: number
): BlockDecoration | null {
  const doc = view.state.doc;
  const line = doc.line(lineNo);
  const start = line.text.indexOf('%%');
  if (start === -1) return null;
  if (start !== line.text.length - line.text.trimStart().length) return null;

  if (line.text.indexOf('%%', start + 2) !== -1) {
    return {
      from: line.from + start,
      to: line.to,
      endLine: lineNo,
      decoration: Decoration.replace({ widget: new CommentWidget('注释') })
    };
  }

  const comment: string[] = [line.text.slice(start + 2)];
  let endLine = lineNo;
  let to = line.to;
  for (let cursor = lineNo + 1; cursor <= doc.lines; cursor += 1) {
    const current = doc.line(cursor);
    const end = current.text.indexOf('%%');
    if (end !== -1) {
      comment.push(current.text.slice(0, end));
      endLine = cursor;
      to = current.from + end + 2;
      break;
    }
    comment.push(current.text);
    endLine = cursor;
    to = current.to;
  }

  return {
    from: line.from + start,
    to,
    endLine,
    decoration: Decoration.replace({ block: true, widget: new CommentWidget(comment.join('\n').trim() || '注释') })
  };
}

function parseHtmlBlock(
  view: PreviewDocument,
  lineNo: number
): BlockDecoration | null {
  const doc = view.state.doc;
  const line = doc.line(lineNo);
  if (!/^ {0,3}<\/?[A-Za-z][^>]*>\s*$/.test(line.text)) return null;

  const html: string[] = [line.text.trim()];
  let endLine = lineNo;
  for (let cursor = lineNo + 1; cursor <= doc.lines; cursor += 1) {
    const current = doc.line(cursor);
    if (!current.text.trim()) break;
    if (!/<\/?[A-Za-z][^>]*>/.test(current.text)) break;
    html.push(current.text.trim());
    endLine = cursor;
  }

  const end = doc.line(endLine);
  return {
    from: line.from,
    to: end.to,
    endLine,
    decoration: Decoration.replace({ block: true, widget: new HtmlBlockWidget(html.join('\n')) })
  };
}

function addLineDecorations(
  decorations: InlineDecoration[],
  lineFrom: number,
  text: string,
  options: LineDecorationOptions
): void {
  const inline: InlineDecoration[] = [];
  const reserved: ReservedRange[] = [];
  const { revealSyntax, context } = options;

  const heading = /^(#{1,6})(\s+)/.exec(text);
  if (heading?.[1]) {
    const level = heading[1].length;
    decorations.push({ from: lineFrom, to: lineFrom, decoration: headingLine(level) });
    if (!revealSyntax) {
      inline.push({
        from: lineFrom,
        to: lineFrom + heading[0].length,
        decoration: hiddenToken
      });
      reserve(reserved, 0, heading[0].length);
    }
  }

  const quote = /^(\s*>+\s?)/.exec(text);
  if (quote) {
    decorations.push({ from: lineFrom, to: lineFrom, decoration: quoteLine });
    if (!revealSyntax && tryReserve(reserved, 0, quote[0].length)) {
      inline.push({
        from: lineFrom,
        to: lineFrom + quote[0].length,
        decoration: hiddenToken
      });
    }
  }

  const task = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/.exec(text);
  if (task?.[1] && task[2]) {
    decorations.push({ from: lineFrom, to: lineFrom, decoration: taskLine });
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
  } else {
    const unordered = /^(\s*)([-*+])(\s+)/.exec(text);
    const ordered = /^(\s*)(\d+[.)])(\s+)/.exec(text);
    const list = unordered ?? ordered;
    if (list?.[2]) {
      decorations.push({ from: lineFrom, to: lineFrom, decoration: listLine });
      const markerFrom = (list[1] ?? '').length;
      const markerTo = markerFrom + list[2].length;
      if (!revealSyntax && tryReserve(reserved, markerFrom, markerTo)) {
        inline.push({
          from: lineFrom + markerFrom,
          to: lineFrom + markerTo,
          decoration: Decoration.replace({
            widget: new ListMarkerWidget(unordered ? 'bullet' : 'ordered', list[2])
          })
        });
      }
    }
  }

  if (/^\[\^[^\]\n]+\]:/.test(text)) {
    decorations.push({ from: lineFrom, to: lineFrom, decoration: footnoteLine });
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

  addRegexInline(inline, reserved, lineFrom, text, IMAGE_RE, (match) => {
    const start = match.index;
    const end = start + match[0].length;
    const embed = mediaFromMarkdownImage(match[0], match[1] ?? '', match[2] ?? '', context);
    if (!embed) return [];
    if (revealSyntax) {
      return [{ from: lineFrom + start, to: lineFrom + end, decoration: mediaSyntaxMark(embed) }];
    }
    return [{
      from: lineFrom + start,
      to: lineFrom + end,
      decoration: Decoration.replace({ widget: new InlineMediaWidget(embed) })
    }];
  });

  addRegexInline(inline, reserved, lineFrom, text, OBSIDIAN_EMBED_RE, (match) => {
    const start = match.index;
    const end = start + match[0].length;
    const embed = mediaFromObsidianEmbed(match[0], match[1] ?? '', context);
    if (!embed) return [];
    if (revealSyntax) {
      return [{ from: lineFrom + start, to: lineFrom + end, decoration: mediaSyntaxMark(embed) }];
    }
    return [{
      from: lineFrom + start,
      to: lineFrom + end,
      decoration: Decoration.replace({ widget: new InlineMediaWidget(embed) })
    }];
  });

  addRegexInline(inline, reserved, lineFrom, text, LINK_RE, (match) => {
    const start = match.index;
    const end = start + match[0].length;
    const label = match[1] ?? '';
    const linkedMedia = mediaFromMarkdownLink(match[0], label, match[2] ?? '', context);
    if (linkedMedia && linkedMedia.kind !== 'file' && linkedMedia.kind !== 'note') {
      if (revealSyntax) {
        return [{ from: lineFrom + start, to: lineFrom + end, decoration: mediaSyntaxMark(linkedMedia) }];
      }
      return [{
        from: lineFrom + start,
        to: lineFrom + end,
        decoration: Decoration.replace({ widget: new InlineMediaWidget(linkedMedia) })
      }];
    }

    const labelFrom = start + 1;
    const labelTo = labelFrom + label.length;
    if (revealSyntax) {
      return [
        {
          from: lineFrom + start,
          to: lineFrom + end,
          decoration: Decoration.mark({
            class: 'cm-md-live-link',
            attributes: { 'data-md-target': markdownDestination(match[2] ?? '').target }
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
          attributes: { 'data-md-target': markdownDestination(match[2] ?? '').target }
        })
      },
      { from: lineFrom + labelTo, to: lineFrom + end, decoration: hiddenToken }
    ];
  });

  addRegexInline(inline, reserved, lineFrom, text, WIKILINK_RE, (match) => {
    const start = match.index;
    const end = start + match[0].length;
    const inner = match[1] ?? '';
    const parsed = parseObsidianTarget(inner);
    const visibleStart = parsed.alias ? start + 2 + parsed.target.length + 1 : start + 2;
    const visibleEnd = end - 2;
    if (revealSyntax) {
      return [
        {
          from: lineFrom + start,
          to: lineFrom + end,
          decoration: Decoration.mark({
            class: 'cm-md-live-wikilink',
            attributes: { 'data-md-target': parsed.target }
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
          attributes: { 'data-md-target': parsed.target }
        })
      },
      { from: lineFrom + visibleEnd, to: lineFrom + end, decoration: hiddenToken }
    ];
  });

  addSimpleSyntaxMark(inline, reserved, lineFrom, text, AUTOLINK_RE, 'cm-md-live-link');
  addSimpleSyntaxMark(inline, reserved, lineFrom, text, BARE_URL_RE, 'cm-md-live-link');

  addPairedInline(inline, reserved, lineFrom, text, HIGHLIGHT_RE, revealSyntax, 2, highlightMark);
  addPairedInline(inline, reserved, lineFrom, text, STRONG_RE, revealSyntax, (match) => match[1]?.length ?? 2, strongMark);
  addPairedInline(inline, reserved, lineFrom, text, STRIKE_RE, revealSyntax, 2, strikeMark);
  addPairedInline(inline, reserved, lineFrom, text, EMPHASIS_RE, revealSyntax, 1, emphasisMark);
  addPairedInline(inline, reserved, lineFrom, text, INLINE_MATH_RE, revealSyntax, 1, inlineMathMark);

  addSimpleSyntaxMark(inline, reserved, lineFrom, text, FOOTNOTE_REF_RE, 'cm-md-live-footnote-ref', footnoteRefMark);
  addTagMarks(inline, reserved, lineFrom, text);
  addSimpleSyntaxMark(inline, reserved, lineFrom, text, HTML_INLINE_RE, 'cm-md-live-html', htmlMark);

  addRegexInline(inline, reserved, lineFrom, text, INLINE_COMMENT_RE, (match) => {
    const start = match.index;
    const end = start + match[0].length;
    if (revealSyntax) {
      return [{ from: lineFrom + start, to: lineFrom + end, decoration: Decoration.mark({ class: 'cm-md-live-comment' }) }];
    }
    return [{ from: lineFrom + start, to: lineFrom + end, decoration: hiddenToken }];
  });

  inline
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .forEach((item) => decorations.push(item));
}

function addPairedInline(
  inline: InlineDecoration[],
  reserved: ReservedRange[],
  lineFrom: number,
  text: string,
  regex: RegExp,
  revealSyntax: boolean,
  markerLength: number | ((match: RegExpExecArray) => number),
  decoration: Decoration
): void {
  addRegexInline(inline, reserved, lineFrom, text, regex, (match) => {
    const marker = typeof markerLength === 'function' ? markerLength(match) : markerLength;
    const start = match.index;
    const end = start + match[0].length;
    if (revealSyntax) {
      return [{ from: lineFrom + start + marker, to: lineFrom + end - marker, decoration }];
    }
    return [
      { from: lineFrom + start, to: lineFrom + start + marker, decoration: hiddenToken },
      { from: lineFrom + start + marker, to: lineFrom + end - marker, decoration },
      { from: lineFrom + end - marker, to: lineFrom + end, decoration: hiddenToken }
    ];
  });
}

function addSimpleSyntaxMark(
  inline: InlineDecoration[],
  reserved: ReservedRange[],
  lineFrom: number,
  text: string,
  regex: RegExp,
  className: string,
  decoration = Decoration.mark({ class: className })
): void {
  addRegexInline(inline, reserved, lineFrom, text, regex, (match) => [
    { from: lineFrom + match.index, to: lineFrom + match.index + match[0].length, decoration }
  ]);
}

function addTagMarks(
  inline: InlineDecoration[],
  reserved: ReservedRange[],
  lineFrom: number,
  text: string
): void {
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(text))) {
    const prefix = match[1] ?? '';
    const tag = match[2] ?? '';
    const localFrom = match.index + prefix.length;
    const localTo = localFrom + tag.length + 1;
    if (!tryReserve(reserved, localFrom, localTo)) continue;
    inline.push({ from: lineFrom + localFrom, to: lineFrom + localTo, decoration: tagMark });
  }
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

function lineOverlapsRanges(from: number, to: number, ranges: ReservedRange[]): boolean {
  return ranges.some((range) => from < range.to && to > range.from);
}

function looksLikeTableRow(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.includes('|') && !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed);
}

function isTableSeparator(text: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(text.trim());
}

function splitTableRow(text: string): string[] {
  return text
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function parseTableAlignments(text: string): TableAlignment[] {
  return splitTableRow(text).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

function parseOnlyMediaEmbeds(text: string, context: MarkdownLivePreviewContext): MediaEmbed[] {
  if (!text) return [];
  const embeds: MediaEmbed[] = [];
  let rest = text;

  while (rest.trim()) {
    const trimmed = rest.trimStart();
    rest = trimmed;
    const markdown = /^!\[([^\]\n]*?)\]\(([^)\n]+?)\)/.exec(rest);
    const obsidian = /^!\[\[([^\]\n]+?)\]\]/.exec(rest);
    const embed = markdown
      ? mediaFromMarkdownImage(markdown[0], markdown[1] ?? '', markdown[2] ?? '', context)
      : obsidian
        ? mediaFromObsidianEmbed(obsidian[0], obsidian[1] ?? '', context)
        : null;
    if (!embed) return [];
    embeds.push(embed);
    rest = rest.slice(embed.raw.length);
  }

  return embeds;
}

function mediaEmbedsFromText(text: string, context: MarkdownLivePreviewContext): MediaEmbed[] {
  const embeds: MediaEmbed[] = [];

  IMAGE_RE.lastIndex = 0;
  let image: RegExpExecArray | null;
  while ((image = IMAGE_RE.exec(text))) {
    const embed = mediaFromMarkdownImage(image[0], image[1] ?? '', image[2] ?? '', context);
    if (embed) embeds.push(embed);
  }

  OBSIDIAN_EMBED_RE.lastIndex = 0;
  let obsidian: RegExpExecArray | null;
  while ((obsidian = OBSIDIAN_EMBED_RE.exec(text))) {
    const embed = mediaFromObsidianEmbed(obsidian[0], obsidian[1] ?? '', context);
    if (embed) embeds.push(embed);
  }

  LINK_RE.lastIndex = 0;
  let link: RegExpExecArray | null;
  while ((link = LINK_RE.exec(text))) {
    if (link.index > 0 && text[link.index - 1] === '!') continue;
    const embed = mediaFromMarkdownLink(link[0], link[1] ?? '', link[2] ?? '', context);
    if (embed) embeds.push(embed);
  }

  return embeds;
}

function contentWithoutMediaSyntax(text: string): string {
  return text
    .replace(IMAGE_RE, '')
    .replace(OBSIDIAN_EMBED_RE, '')
    .replace(LINK_RE, '')
    .replace(/\s+·\s+/g, ' · ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function mediaFromMarkdownImage(
  raw: string,
  alt: string,
  destination: string,
  context: MarkdownLivePreviewContext
): MediaEmbed | null {
  const parsed = markdownDestination(destination);
  const dimensions = parseDimensionHint(parsed.title ?? alt);
  const target = stripTargetFragment(parsed.target);
  return {
    raw,
    label: alt || basename(target) || target,
    target,
    title: parsed.title,
    width: dimensions.width,
    height: dimensions.height,
    kind: mediaKindForTarget(target),
    url: resolveAssetUrl(target, context)
  };
}

function mediaFromMarkdownLink(
  raw: string,
  label: string,
  destination: string,
  context: MarkdownLivePreviewContext
): MediaEmbed | null {
  const parsed = markdownDestination(destination);
  const target = stripTargetFragment(parsed.target);
  return {
    raw,
    label: label || basename(target) || target,
    target,
    title: parsed.title,
    kind: mediaKindForTarget(target),
    url: resolveAssetUrl(target, context)
  };
}

function mediaFromObsidianEmbed(
  raw: string,
  inner: string,
  context: MarkdownLivePreviewContext
): MediaEmbed | null {
  const parsed = parseObsidianTarget(inner);
  const dimensions = parseDimensionHint(parsed.alias);
  const target = stripTargetFragment(parsed.target);
  return {
    raw,
    label: parsed.alias && !dimensions.width ? parsed.alias : basename(target) || target,
    target,
    width: dimensions.width,
    height: dimensions.height,
    kind: mediaKindForTarget(target),
    url: resolveAssetUrl(target, context)
  };
}

function markdownDestination(input: string): { target: string; title?: string } {
  let value = input.trim();
  if (value.startsWith('<') && value.endsWith('>')) value = value.slice(1, -1);
  const title = /^(.*?)(?:\s+["']([^"']+)["'])$/.exec(value);
  if (!title) return { target: value };
  return { target: title[1]?.trim() ?? value, title: title[2] };
}

function parseObsidianTarget(input: string): { target: string; alias?: string } {
  const pipe = input.indexOf('|');
  if (pipe === -1) return { target: input.trim() };
  return {
    target: input.slice(0, pipe).trim(),
    alias: input.slice(pipe + 1).trim()
  };
}

function parseDimensionHint(value?: string): { width?: number; height?: number } {
  if (!value) return {};
  const match = /^(\d{2,4})(?:x(\d{2,4}))?$/.exec(value.trim());
  if (!match) return {};
  return {
    width: Number(match[1]),
    ...(match[2] ? { height: Number(match[2]) } : {})
  };
}

function mediaKindForTarget(target: string): MediaKind {
  const ext = extensionForTarget(target);
  if (!ext && target.endsWith('.md')) return 'note';
  if (!ext) return 'note';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'note';
  return 'file';
}

function extensionForTarget(target: string): string | null {
  const clean = stripTargetFragment(target).split('?')[0] ?? target;
  const match = /\.([A-Za-z0-9]+)$/.exec(clean);
  return match?.[1]?.toLowerCase() ?? null;
}

function stripTargetFragment(target: string): string {
  return target.replace(/[#^].*$/, '').trim();
}

function resolveAssetUrl(target: string, context: MarkdownLivePreviewContext): string | null {
  const clean = target.trim();
  if (!clean) return null;
  if (/^file:/i.test(clean)) {
    const vaultRelative = vaultRelativeFromFileUrl(clean, context);
    return vaultRelative ? vaultMediaUrl(vaultRelative) : clean;
  }
  if (/^(https?:|data:|blob:|orbit-media:)/i.test(clean)) return clean;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/i.test(clean)) return null;
  if (!context.vaultRoot) return null;

  if (clean.startsWith('/')) {
    const vaultRelative = vaultRelativeFromAbsolutePath(clean, context.vaultRoot);
    return vaultRelative ? vaultMediaUrl(vaultRelative) : pathToFileUrl(clean);
  }

  const noteDir = context.notePath ? dirnamePosix(context.notePath) : '';
  const relative = normalizePosixPath(isVaultRelativePath(clean) ? clean : joinPosix(noteDir, clean));
  return vaultMediaUrl(relative);
}

function isVaultRelativePath(value: string): boolean {
  const normalized = normalizePosixPath(value);
  const root = normalized.split('/')[0] ?? '';
  return VAULT_RELATIVE_ROOTS.has(root);
}

function vaultMediaUrl(relativePath: string): string {
  const encoded = normalizePosixPath(relativePath)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `orbit-media://vault/${encoded}`;
}

function vaultRelativeFromFileUrl(value: string, context: MarkdownLivePreviewContext): string | null {
  if (!context.vaultRoot) return null;
  try {
    const url = new URL(value);
    return vaultRelativeFromAbsolutePath(decodeURIComponent(url.pathname), context.vaultRoot);
  } catch {
    return null;
  }
}

function vaultRelativeFromAbsolutePath(filePath: string, vaultRoot: string): string | null {
  const normalizedRoot = vaultRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (normalizedPath === normalizedRoot) return '';
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return null;
  return normalizePosixPath(normalizedPath.slice(normalizedRoot.length + 1));
}

function pathToFileUrl(filePath: string): string {
  let normalized = filePath.replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(normalized)) normalized = `/${normalized}`;
  return `file://${encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

function dirnamePosix(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index);
}

function joinPosix(...parts: string[]): string {
  return parts.filter(Boolean).join('/');
}

function normalizePosixPath(input: string): string {
  const output: string[] = [];
  for (const part of input.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') output.pop();
    else output.push(part);
  }
  return output.join('/');
}

function basename(target: string): string {
  const clean = stripTargetFragment(target).replace(/\\/g, '/');
  return clean.slice(clean.lastIndexOf('/') + 1);
}

function mediaSyntaxMark(embed: MediaEmbed): Decoration {
  return Decoration.mark({
    class: `cm-md-live-media-syntax cm-md-live-media-syntax-${embed.kind}`,
    attributes: { 'data-md-target': embed.target }
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mediaLabel(kind: MediaKind): string {
  switch (kind) {
    case 'image':
      return '图片';
    case 'audio':
      return '音频';
    case 'video':
      return '视频';
    case 'pdf':
      return 'PDF';
    case 'note':
      return '笔记';
    default:
      return '文件';
  }
}

function appendTextBlock(parent: HTMLElement, text: string): void {
  const lines = text.split('\n');
  for (const line of lines) {
    const paragraph = document.createElement('p');
    paragraph.textContent = line || ' ';
    parent.appendChild(paragraph);
  }
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

class ListMarkerWidget extends WidgetType {
  constructor(
    private readonly kind: 'bullet' | 'ordered',
    private readonly marker: string
  ) {
    super();
  }

  eq(other: ListMarkerWidget): boolean {
    return other.kind === this.kind && other.marker === this.marker;
  }

  toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = `cm-md-list-marker cm-md-list-marker-${this.kind}`;
    marker.textContent = this.kind === 'bullet' ? '•' : this.marker.replace(/[.)]$/, '.');
    return marker;
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
    wrapper.textContent = `元数据 ${this.lines} 行`;
    return wrapper;
  }
}

class CodeBlockWidget extends WidgetType {
  constructor(
    private readonly language: string,
    private readonly code: string
  ) {
    super();
  }

  eq(other: CodeBlockWidget): boolean {
    return other.language === this.language && other.code === this.code;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-md-codeblock';
    if (this.language) {
      const label = document.createElement('div');
      label.className = 'cm-md-codeblock-language';
      label.textContent = this.language;
      wrapper.appendChild(label);
    }
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = this.code;
    pre.appendChild(code);
    wrapper.appendChild(pre);
    return wrapper;
  }
}

class MathBlockWidget extends WidgetType {
  constructor(private readonly source: string) {
    super();
  }

  eq(other: MathBlockWidget): boolean {
    return other.source === this.source;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('pre');
    wrapper.className = 'cm-md-mathblock';
    wrapper.textContent = this.source;
    return wrapper;
  }
}

class CalloutWidget extends WidgetType {
  constructor(
    private readonly kind: string,
    private readonly title: string,
    private readonly body: string
  ) {
    super();
  }

  eq(other: CalloutWidget): boolean {
    return other.kind === this.kind && other.title === this.title && other.body === this.body;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = `cm-md-callout cm-md-callout-${this.kind.toLowerCase()}`;
    const title = document.createElement('div');
    title.className = 'cm-md-callout-title';
    title.textContent = this.title || this.kind.toUpperCase();
    wrapper.appendChild(title);
    if (this.body.trim()) {
      const body = document.createElement('div');
      body.className = 'cm-md-callout-body';
      appendTextBlock(body, this.body);
      wrapper.appendChild(body);
    }
    return wrapper;
  }
}

class TableWidget extends WidgetType {
  constructor(private readonly table: TableBlock) {
    super();
  }

  eq(other: TableWidget): boolean {
    return JSON.stringify(other.table) === JSON.stringify(this.table);
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-md-table-wrap';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    this.table.headers.forEach((header, index) => {
      const th = document.createElement('th');
      th.textContent = header;
      applyAlignment(th, this.table.alignments[index] ?? null);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    this.table.rows.forEach((row) => {
      const tr = document.createElement('tr');
      row.forEach((cell, index) => {
        const td = document.createElement('td');
        td.textContent = cell;
        applyAlignment(td, this.table.alignments[index] ?? null);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  }
}

function applyAlignment(cell: HTMLTableCellElement, alignment: TableAlignment): void {
  if (alignment) cell.style.textAlign = alignment;
}

class MediaGroupWidget extends WidgetType {
  constructor(private readonly embeds: MediaEmbed[]) {
    super();
  }

  eq(other: MediaGroupWidget): boolean {
    return JSON.stringify(other.embeds) === JSON.stringify(this.embeds);
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-md-media-group';
    this.embeds.forEach((embed) => wrapper.appendChild(renderMedia(embed, 'block')));
    return wrapper;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class AttachmentMediaWidget extends WidgetType {
  constructor(
    private readonly embeds: MediaEmbed[],
    private readonly caption: string
  ) {
    super();
  }

  eq(other: AttachmentMediaWidget): boolean {
    return JSON.stringify(other.embeds) === JSON.stringify(this.embeds) && other.caption === this.caption;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-md-attachment-media';
    if (this.caption) {
      const label = document.createElement('div');
      label.className = 'cm-md-attachment-media-label';
      label.textContent = this.caption;
      wrapper.appendChild(label);
    }
    const media = document.createElement('div');
    media.className = 'cm-md-attachment-media-body';
    this.embeds.forEach((embed) => media.appendChild(renderMedia(embed, 'block')));
    wrapper.appendChild(media);
    return wrapper;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class InlineMediaWidget extends WidgetType {
  constructor(private readonly embed: MediaEmbed) {
    super();
  }

  eq(other: InlineMediaWidget): boolean {
    return JSON.stringify(other.embed) === JSON.stringify(this.embed);
  }

  toDOM(): HTMLElement {
    return renderMedia(this.embed, 'inline');
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function renderMedia(embed: MediaEmbed, mode: 'block' | 'inline'): HTMLElement {
  const wrapper = document.createElement(embed.kind === 'image' && mode === 'block' ? 'figure' : 'span');
  wrapper.className = `cm-md-media cm-md-media-${mode} cm-md-media-${embed.kind}`;

  if (embed.kind === 'image' && embed.url) {
    const image = document.createElement('img');
    image.src = embed.url;
    image.alt = embed.label;
    image.loading = 'lazy';
    if (embed.width) image.style.maxWidth = `${embed.width}px`;
    if (embed.height) image.style.maxHeight = `${embed.height}px`;
    wrapper.appendChild(image);
  } else if (embed.kind === 'audio' && embed.url) {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = embed.url;
    wrapper.appendChild(audio);
  } else if (embed.kind === 'video' && embed.url) {
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    video.src = embed.url;
    if (embed.width) video.style.maxWidth = `${embed.width}px`;
    if (embed.height) video.style.maxHeight = `${embed.height}px`;
    wrapper.appendChild(video);
  } else if (embed.kind === 'pdf' && embed.url && mode === 'block') {
    const frame = document.createElement('iframe');
    frame.src = embed.url;
    frame.title = embed.label;
    wrapper.appendChild(frame);
  } else {
    const link = document.createElement(embed.url ? 'a' : 'span');
    link.className = 'cm-md-media-file';
    link.textContent = `${mediaLabel(embed.kind)} · ${embed.label}`;
    if (link instanceof HTMLAnchorElement && embed.url) {
      link.href = embed.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
    }
    wrapper.appendChild(link);
  }

  if (mode === 'block' && embed.label && embed.kind !== 'audio') {
    const caption = document.createElement('figcaption');
    caption.textContent = embed.label;
    wrapper.appendChild(caption);
  }
  return wrapper;
}

class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-md-hr';
    return wrapper;
  }
}

class FootnoteWidget extends WidgetType {
  constructor(
    private readonly id: string,
    private readonly content: string
  ) {
    super();
  }

  eq(other: FootnoteWidget): boolean {
    return other.id === this.id && other.content === this.content;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-md-footnote';
    const id = document.createElement('span');
    id.className = 'cm-md-footnote-id';
    id.textContent = `[^${this.id}]`;
    const content = document.createElement('span');
    content.textContent = this.content;
    wrapper.append(id, content);
    return wrapper;
  }
}

class HtmlBlockWidget extends WidgetType {
  constructor(private readonly html: string) {
    super();
  }

  eq(other: HtmlBlockWidget): boolean {
    return other.html === this.html;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('pre');
    wrapper.className = 'cm-md-htmlblock';
    wrapper.textContent = this.html;
    return wrapper;
  }
}

class CommentWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }

  eq(other: CommentWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-md-comment-widget';
    wrapper.textContent = this.text;
    return wrapper;
  }
}

export const livePreviewTheme = EditorView.baseTheme({
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
  '.cm-md-live-list': {
    paddingLeft: '2px'
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
  '.cm-md-live-strike': {
    textDecoration: 'line-through'
  },
  '.cm-md-live-highlight': {
    borderRadius: '3px',
    backgroundColor: '#fef08a',
    padding: '0 2px'
  },
  '.cm-md-live-inline-code, .cm-md-live-inline-math': {
    border: '1px solid #e5e5e5',
    borderRadius: '4px',
    backgroundColor: '#f5f5f5',
    color: '#262626',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '0.92em',
    padding: '1px 4px'
  },
  '.cm-md-live-inline-math': {
    color: '#7c3aed'
  },
  '.cm-md-live-link, .cm-md-live-wikilink, .cm-md-live-media-syntax': {
    color: '#2563eb',
    textDecoration: 'underline',
    textUnderlineOffset: '2px'
  },
  '.cm-md-live-tag, .cm-md-live-footnote-ref': {
    borderRadius: '999px',
    backgroundColor: '#eef2ff',
    color: '#4338ca',
    fontSize: '0.92em',
    padding: '1px 6px'
  },
  '.cm-md-live-html, .cm-md-live-comment': {
    color: '#737373',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '0.92em'
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
  '.cm-md-list-marker': {
    display: 'inline-block',
    minWidth: '1.15em',
    color: '#737373',
    fontWeight: '600'
  },
  '.cm-md-frontmatter, .cm-md-codeblock, .cm-md-mathblock, .cm-md-callout, .cm-md-table-wrap, .cm-md-footnote, .cm-md-htmlblock': {
    margin: '8px 0 14px'
  },
  '.cm-md-frontmatter': {
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: '#fafafa',
    color: '#737373',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '12px',
    padding: '7px 9px'
  },
  '.cm-md-codeblock, .cm-md-mathblock, .cm-md-htmlblock': {
    overflow: 'auto',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: '#f7f7f7',
    color: '#262626',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '12px'
  },
  '.cm-md-codeblock pre, .cm-md-mathblock, .cm-md-htmlblock': {
    margin: '0',
    padding: '12px 14px',
    whiteSpace: 'pre-wrap'
  },
  '.cm-md-codeblock-language': {
    borderBottom: '1px solid #e5e5e5',
    color: '#737373',
    fontSize: '11px',
    padding: '6px 14px'
  },
  '.cm-md-callout': {
    border: '1px solid #bfdbfe',
    borderLeft: '4px solid #2563eb',
    borderRadius: '6px',
    backgroundColor: '#eff6ff',
    padding: '10px 12px'
  },
  '.cm-md-callout-title': {
    color: '#1d4ed8',
    fontSize: '13px',
    fontWeight: '700'
  },
  '.cm-md-callout-body': {
    marginTop: '6px',
    color: '#1f2937',
    fontSize: '13px',
    lineHeight: '1.6'
  },
  '.cm-md-callout-body p': {
    margin: '2px 0'
  },
  '.cm-md-table-wrap': {
    overflowX: 'auto'
  },
  '.cm-md-table-wrap table': {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  },
  '.cm-md-table-wrap th, .cm-md-table-wrap td': {
    border: '1px solid #e5e5e5',
    padding: '6px 8px',
    verticalAlign: 'top'
  },
  '.cm-md-table-wrap th': {
    backgroundColor: '#f5f5f5',
    fontWeight: '700'
  },
  '.cm-md-media-group': {
    display: 'grid',
    gap: '10px',
    margin: '8px 0 14px'
  },
  '.cm-md-attachment-media': {
    display: 'grid',
    gap: '8px',
    margin: '8px 0 14px',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: '#fafafa',
    padding: '10px 12px'
  },
  '.cm-md-attachment-media-label': {
    color: '#525252',
    fontSize: '12px',
    fontWeight: '600'
  },
  '.cm-md-attachment-media-body': {
    display: 'grid',
    gap: '10px'
  },
  '.cm-md-media': {
    maxWidth: '100%'
  },
  '.cm-md-media-block': {
    display: 'block'
  },
  '.cm-md-media-inline': {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: 'min(360px, 100%)',
    verticalAlign: 'middle'
  },
  '.cm-md-media img': {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '520px',
    borderRadius: '6px',
    border: '1px solid #e5e5e5',
    objectFit: 'contain'
  },
  '.cm-md-media-inline img': {
    maxHeight: '120px'
  },
  '.cm-md-media audio': {
    width: 'min(520px, 100%)'
  },
  '.cm-md-media video': {
    display: 'block',
    width: 'min(720px, 100%)',
    maxHeight: '520px',
    borderRadius: '6px',
    border: '1px solid #e5e5e5',
    backgroundColor: '#000000'
  },
  '.cm-md-media iframe': {
    width: '100%',
    height: '520px',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: '#ffffff'
  },
  '.cm-md-media figcaption': {
    marginTop: '6px',
    color: '#737373',
    fontSize: '12px'
  },
  '.cm-md-media-file': {
    display: 'inline-flex',
    alignItems: 'center',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    backgroundColor: '#fafafa',
    color: '#2563eb',
    padding: '6px 9px',
    textDecoration: 'none'
  },
  '.cm-md-hr': {
    height: '1px',
    margin: '16px 0',
    backgroundColor: '#d4d4d4'
  },
  '.cm-md-footnote': {
    display: 'flex',
    gap: '8px',
    borderTop: '1px solid #e5e5e5',
    color: '#525252',
    fontSize: '12px',
    paddingTop: '8px'
  },
  '.cm-md-footnote-id': {
    color: '#2563eb',
    fontWeight: '700'
  },
  '.cm-md-comment-widget': {
    borderRadius: '4px',
    backgroundColor: '#f5f5f5',
    color: '#737373',
    fontSize: '12px',
    padding: '1px 6px'
  },
  '.dark & .cm-md-live-quote': {
    borderLeftColor: '#525252',
    color: '#d4d4d4'
  },
  '.dark & .cm-md-live-highlight': {
    backgroundColor: '#713f12',
    color: '#fef3c7'
  },
  '.dark & .cm-md-live-inline-code, .dark & .cm-md-live-inline-math': {
    borderColor: '#404040',
    backgroundColor: '#171717',
    color: '#e5e5e5'
  },
  '.dark & .cm-md-live-inline-math': {
    color: '#c4b5fd'
  },
  '.dark & .cm-md-live-link, .dark & .cm-md-live-wikilink, .dark & .cm-md-live-media-syntax': {
    color: '#93c5fd'
  },
  '.dark & .cm-md-live-tag, .dark & .cm-md-live-footnote-ref': {
    backgroundColor: '#1e1b4b',
    color: '#c7d2fe'
  },
  '.dark & .cm-md-frontmatter, .dark & .cm-md-codeblock, .dark & .cm-md-mathblock, .dark & .cm-md-htmlblock': {
    borderColor: '#262626',
    backgroundColor: '#171717',
    color: '#d4d4d4'
  },
  '.dark & .cm-md-codeblock-language': {
    borderBottomColor: '#262626',
    color: '#a3a3a3'
  },
  '.dark & .cm-md-callout': {
    borderColor: '#1e3a8a',
    borderLeftColor: '#60a5fa',
    backgroundColor: '#172554'
  },
  '.dark & .cm-md-callout-title': {
    color: '#bfdbfe'
  },
  '.dark & .cm-md-callout-body': {
    color: '#dbeafe'
  },
  '.dark & .cm-md-table-wrap th, .dark & .cm-md-table-wrap td': {
    borderColor: '#262626'
  },
  '.dark & .cm-md-table-wrap th': {
    backgroundColor: '#171717'
  },
  '.dark & .cm-md-attachment-media': {
    borderColor: '#262626',
    backgroundColor: '#171717'
  },
  '.dark & .cm-md-attachment-media-label': {
    color: '#d4d4d4'
  },
  '.dark & .cm-md-media img, .dark & .cm-md-media video, .dark & .cm-md-media iframe': {
    borderColor: '#262626'
  },
  '.dark & .cm-md-media-file, .dark & .cm-md-comment-widget': {
    borderColor: '#262626',
    backgroundColor: '#171717',
    color: '#93c5fd'
  },
  '.dark & .cm-md-hr': {
    backgroundColor: '#404040'
  },
  '.dark & .cm-md-footnote': {
    borderTopColor: '#262626',
    color: '#d4d4d4'
  },
  '.dark & .cm-md-footnote-id': {
    color: '#93c5fd'
  }
});
