import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { analyzePage, describeLayout, type PageLayout, type Raster } from './pdfLayout';

// MV3 forbids remote code, so the worker is bundled and served from the extension.
GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 10;
const RENDER_SCALE = 2;

async function renderPage(page: PDFPageProxy): Promise<Raster> {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available.');
  await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: img.data, width: img.width, height: img.height, scale: RENDER_SCALE };
}

async function plainText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  let text = '';
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const t = item as TextItem;
    text += t.str;
    if (t.hasEOL) text += '\n';
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extracts a PDF resume for the AI: its content in reading order plus a
 * measured description of the design (columns, fonts, colors, boxes, rules),
 * so the generated LaTeX can mimic the original layout. Falls back to plain
 * text if the layout analysis fails. Hyperlink targets are appended because
 * PDF link text often hides the real URL.
 */
export async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = getDocument({ data, fontExtraProperties: true });
  const pdf = await loadingTask.promise;

  try {
    const pageCount = Math.min(pdf.numPages, MAX_PAGES);
    const links = new Set<string>();
    const texts: string[] = [];
    const layouts: PageLayout[] = [];
    let layoutFailed = false;

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      texts.push(await plainText(page));
      for (const annot of await page.getAnnotations()) {
        if (annot.subtype === 'Link' && typeof annot.url === 'string') links.add(annot.url);
      }
      if (!layoutFailed) {
        try {
          layouts.push(await analyzePage(page, await renderPage(page)));
        } catch (err) {
          console.warn('[ResTail] PDF layout analysis failed, using plain text.', err);
          layoutFailed = true;
        }
      }
    }

    const text = texts.filter(Boolean).join('\n\n');
    if (text.replace(/\s/g, '').length < 50) {
      throw new Error('No selectable text found in this PDF. Scanned/image PDFs are not supported.');
    }

    let body = text;
    if (!layoutFailed && layouts.some((l) => l.segments.length > 0)) {
      try {
        body = describeLayout(layouts.filter((l) => l.segments.length > 0));
      } catch (err) {
        console.warn('[ResTail] PDF layout description failed, using plain text.', err);
      }
    }

    return links.size > 0 ? `${body}\n\nHYPERLINKS IN THE ORIGINAL PDF:\n${[...links].join('\n')}` : body;
  } finally {
    await loadingTask.destroy();
  }
}
