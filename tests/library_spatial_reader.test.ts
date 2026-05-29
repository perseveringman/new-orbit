import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '@shared/library';
import { getLibraryReaderSource, normalizeLibraryReaderSource } from '../src/renderer/src/components/spatial-reader/reader-model';

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Library spatial reader parity', () => {
  it('routes the five Library reader kinds into dedicated rich reader surfaces', async () => {
    const source = await readSource('src/renderer/src/components/spatial-reader/LibrarySpatialReader.tsx');
    const model = await readSource('src/renderer/src/components/spatial-reader/reader-model.ts');

    for (const reader of ['RichMarkdownReader', 'RichPdfReader', 'RichEpubReader', 'RichYouTubeReader', 'RichPodcastReader']) {
      expect(source).toContain(`<${reader}`);
    }

    expect(model).toContain("kind === 'markdown'");
    expect(model).toContain("kind === 'pdf'");
    expect(model).toContain("kind === 'epub'");
    expect(model).toContain("kind === 'video'");
    expect(model).toContain("kind === 'podcast'");
  });

  it('keeps the spatial selection action contract aligned across readers', async () => {
    const source = await readSource('src/renderer/src/components/spatial-reader/LibrarySpatialReader.tsx');

    for (const label of ['翻译', '名词解释', '公式解析', '关联检索']) {
      expect(source).toContain(`label: '${label}'`);
    }

    expect(source).toContain('onCreateNote={createSelectionNote}');
    expect(source).toContain('onCreateChat={createSelectionChat}');
    expect(source).toContain('onRunAll={runAllSelectionActions}');
    expect(source).toContain('window.orbit.annotation.generate');
    expect(source).toContain('window.orbit.annotation');
    expect(source).toContain('.create(input)');
  });

  it('captures selections and re-renders persisted highlights on text, media, PDF, and EPUB surfaces', async () => {
    const source = await readSource('src/renderer/src/components/spatial-reader/LibrarySpatialReader.tsx');

    expect(source).toContain('function getReaderSelectionFromRoot(');
    expect(source).toContain('function HtmlArticleReader');
    expect(source).toContain('source_html_ref');
    expect(source).toContain('function getInlineArticleHtml');
    expect(source).toContain('dangerouslySetInnerHTML');
    expect(source).toContain('wechat-article-body');
    expect(source).toContain('getRangeQuoteContext(root, range, rawText, text)');
    expect(source).toContain('renderReaderQuoteHighlights(root, thoughtNodes)');
    expect(source).toContain("document.addEventListener('pointerup', captureSelection)");
    expect(source).toContain("document.addEventListener('keyup', captureSelection)");
    expect(source).toContain('onPointerUpCapture={captureSelection}');
    expect(source).toContain('onKeyUpCapture={captureSelection}');
    expect(source).toContain('renderPdfQuoteHighlights(contentRef.current');
    expect(source).toContain('getPdfSelectionRects(pageRefs.current)');
    expect(source).toContain('<PdfRectHighlightOverlay');
    expect(source).toContain('data-pdf-rect-highlight={node.id}');
    expect(source).toContain('getPdfRectHighlightNodeAtPoint({');
    expect(source).toContain('onActivateThought?.(nodeId)');
    expect(source).toContain('decorateThoughtHighlights(root, thoughtNodes, onActivateThought)');
    expect(source).toContain('onRenderTextLayerSuccess={() => {');
    expect(source).toContain('rendition.annotations?.add(');
    expect(source).toContain('rendition.annotations?.remove(cfi,');
    expect(source).toContain('renderEpubQuoteHighlights(rendition, nextNodes, onActivateThought)');
    expect(source).toContain('rendition.themes?.default({');
    expect(source).toContain('scheduleEpubFramePaint(rendition, containerRef.current)');
    expect(source).toContain('ensureEpubReadableTarget(');
    expect(source).toContain('firstEpubTocTarget(navigation?.toc ?? [])');
    expect(source).toContain('pruneEmptyEpubContainers(container)');
    expect(source).toContain('applyEpubContentStyles(contents.document)');
    expect(source).toContain("contents.document.addEventListener('mouseup', syncSelection)");
    expect(source).toContain('sourceCfi: typeof record.anchor.range?.from ===');
  });

  it('stores EPUB CFI anchors so EPUB highlights survive reloads', async () => {
    const source = await readSource('src/renderer/src/components/spatial-reader/LibrarySpatialReader.tsx');

    expect(source).toContain('const epubReaderSelectionRef = useRef<typeof onReaderSelection>(onReaderSelection)');
    expect(source).toContain('epubReaderSelectionRef.current?.({');
    expect(source).toContain('}, [item.frontmatter.id, mode, source, sourceWindowId]);');
    expect(source).not.toContain('}, [item.frontmatter.id, mode, onReaderSelection, source, sourceWindowId]);');
    expect(source).toContain("const [mode, setMode] = useState<'paginated' | 'scrolled'>('scrolled');");
    expect(source).toContain('const cfi = contents.cfiFromRange?.(range)');
    expect(source).toContain('...(cfi ? { cfi } : {})');
    expect(source).toContain("...(nextSelection.cfi ? { range: { from: nextSelection.cfi } } : {})");
    expect(source).toContain('sourceCfi: nextSelection.cfi');
    expect(source).toContain('sourceCfi: selection.cfi');
  });

  it('opens PDFs in continuous reading mode and tracks the visible page', async () => {
    const source = await readSource('src/renderer/src/components/spatial-reader/LibrarySpatialReader.tsx');

    expect(source).toContain("const [scrollMode, setScrollMode] = useState<'paginated' | 'scrolled'>('scrolled')");
    expect(source).toContain('const [pdfZoom, setPdfZoom] = useState(1)');
    expect(source).toContain('const renderedPageWidth = Math.round(pageWidth * pdfZoom)');
    expect(source).toContain('width={renderedPageWidth}');
    expect(source).toContain('updatePdfZoom(pdfZoom - 0.1)');
    expect(source).toContain('updatePdfZoom(pdfZoom + 0.1)');
    expect(source).toContain('const scrollRootRef = useRef<HTMLDivElement>(null)');
    expect(source).toContain('ref={scrollRootRef}');
    expect(source).toContain('data-pdf-page-number={page}');
    expect(source).toContain('new IntersectionObserver(');
    expect(source).toContain('READER_SCROLL_TO_ANNOTATION_EVENT');
    expect(source).toContain('scrollPdfAnnotationIntoView(detail.nodeId, page)');
    expect(source).toContain('scrollToThoughtSource(nodeId)');
  });

  it('hides annotation child windows when their source highlight leaves the reader viewport', async () => {
    const source = await readSource('src/renderer/src/components/spatial-reader/LibrarySpatialReader.tsx');

    expect(source).toContain('useOpenSourceVisibleThoughtNodeIds({');
    expect(source).toContain('hiddenBySource={!sourceVisibleThoughtNodeIds.has(node.id)}');
    expect(source).toContain("display: hiddenBySource ? 'none' : undefined");
    expect(source).toContain('getOpenSourceVisibleThoughtNodeIds(');
    expect(source).toContain('hasVisibleHighlightInRoot({');
    expect(source).toContain('[data-pdf-rect-highlight="${escapedId}"]');
    expect(source).toContain('intersects(rect, viewportRect)');
  });

  it('preserves media reader seek, auto-follow, and selection suppression behavior', async () => {
    const source = await readSource('src/renderer/src/components/spatial-reader/LibrarySpatialReader.tsx');

    expect(source).toContain("const [autoFollowMode, setAutoFollowMode] = useState<'following' | 'free'>('following')");
    expect(source).toContain('function useMediaSelectionGesture()');
    expect(source).toContain('const selectionGesture = useMediaSelectionGesture()');
    expect(source).toContain('scrollActiveItemIntoView');
    expect(source).toContain('正在自由查看');
    expect(source).toContain('if (selectionGesture.shouldSuppressSeek()) {');
    expect(source).toContain('selectionGesture.syncAfterGesture()');
    expect(source).toContain('onPointerDownCapture={selectionGesture.handlePointerDownCapture}');
    expect(source).toContain('onPointerUpCapture={selectionGesture.handlePointerUpCapture}');
    expect(source).toContain('onKeyUpCapture={selectionGesture.handleKeyUpCapture}');
  });

  it('resolves vault-local reader assets through the Orbit media protocol', () => {
    const vaultRoot = '/Users/example/Vault';
    const item = {
      frontmatter: {
        id: 'lib-pdf',
        title: 'PDF',
        kind: 'pdf',
        local_path: '/Users/example/Vault/library/pdfs/file name.pdf#page=2'
      },
      body: ''
    } as LibraryItem;

    expect(getLibraryReaderSource(item, vaultRoot)).toBe('orbit-media://vault/library/pdfs/file%20name.pdf#page=2');
    expect(normalizeLibraryReaderSource('media/audio.wav', vaultRoot)).toBe('orbit-media://vault/media/audio.wav');
    expect(normalizeLibraryReaderSource('/tmp/outside.pdf', vaultRoot)).toBe('file:///tmp/outside.pdf');
    expect(normalizeLibraryReaderSource('https://example.com/file.pdf', vaultRoot)).toBe('https://example.com/file.pdf');
  });
});
