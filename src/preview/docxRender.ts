import JSZip from 'jszip';

/**
 * In-browser preview of a Word resume, without a server.
 *
 * docx-preview gets most of a resume right but ignores two parts of Word's style
 * inheritance that resumes rely on, and the fonts are rarely installed. Before
 * rendering, a preview-only copy of the file is adjusted so the HTML matches what
 * Word shows; the downloaded file is never touched.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Microsoft fonts → free Google Fonts with the same metrics (or closest look), so lines wrap like in Word. */
const FONT_SUBSTITUTES: Record<string, string> = {
  calibri: 'Carlito',
  cambria: 'Caladea',
  garamond: 'EB Garamond',
  'times new roman': 'Tinos',
  arial: 'Arimo',
  helvetica: 'Arimo',
  'courier new': 'Cousine',
  georgia: 'Gelasio',
  'century gothic': 'Questrial',
  'book antiqua': 'Libre Baskerville',
  palatino: 'Libre Baskerville',
  'trebuchet ms': 'Fira Sans',
  verdana: 'PT Sans',
  tahoma: 'PT Sans',
  'segoe ui': 'Open Sans',
};

/** Fonts that are system fonts or symbols; not worth requesting from Google Fonts. */
const NOT_ON_GOOGLE = /symbol|wingdings|webdings|ms |segoe|mt extra|courier new|times new roman|arial|calibri|cambria|verdana|tahoma|garamond|georgia|helvetica|trebuchet|book antiqua|palatino|century gothic/i;

const el = (parent: Element, name: string) =>
  Array.from(parent.childNodes).find((n): n is Element => n.nodeType === 1 && (n as Element).localName === name && (n as Element).namespaceURI === W) ?? null;
const attr = (e: Element | null | undefined, name: string) => e?.getAttributeNS(W, name) ?? null;

interface StyleInfo {
  basedOn: string | null;
  pPr: Element | null;
}

function readStyles(styles: Document) {
  const map = new Map<string, StyleInfo>();
  let defaultParagraph: string | null = null;
  for (const s of Array.from(styles.getElementsByTagNameNS(W, 'style'))) {
    if (attr(s, 'type') !== 'paragraph') continue;
    const id = attr(s, 'styleId');
    if (!id) continue;
    map.set(id, { basedOn: attr(el(s, 'basedOn'), 'val'), pPr: el(s, 'pPr') });
    if (attr(s, 'default') === '1' || attr(s, 'default') === 'true') defaultParagraph = id;
  }
  return { map, defaultParagraph };
}

/** Tab stops a paragraph style ends up with after its basedOn chain ("clear" removes inherited stops). */
function inheritedTabs(styleId: string | null, styles: Map<string, StyleInfo>): Element[] {
  const chain: StyleInfo[] = [];
  const seen = new Set<string>();
  for (let id = styleId; id && styles.has(id) && !seen.has(id); id = styles.get(id)!.basedOn) {
    seen.add(id);
    chain.unshift(styles.get(id)!);
  }
  const byPos = new Map<string, Element>();
  for (const s of chain) {
    const tabs = s.pPr && el(s.pPr, 'tabs');
    for (const t of tabs ? Array.from(tabs.getElementsByTagNameNS(W, 'tab')) : []) {
      const pos = attr(t, 'pos') ?? '';
      if (attr(t, 'val') === 'clear') byPos.delete(pos);
      else byPos.set(pos, t);
    }
  }
  return [...byPos.values()];
}

/**
 * Word: when a list comes from a paragraph style, the style's indent wins over the
 * numbering level's indent. docx-preview does the opposite, which pushes bullets far right.
 */
function fixListIndents(styles: Map<string, StyleInfo>, numbering: Document) {
  for (const s of styles.values()) {
    const numPr = s.pPr && el(s.pPr, 'numPr');
    const ind = s.pPr && el(s.pPr, 'ind');
    const numId = attr(numPr && el(numPr, 'numId'), 'val');
    if (!numId || !ind) continue;
    const ilvl = attr(numPr && el(numPr, 'ilvl'), 'val') ?? '0';
    const num = Array.from(numbering.getElementsByTagNameNS(W, 'num')).find((n) => attr(n, 'numId') === numId);
    const absId = attr(num && el(num, 'abstractNumId'), 'val');
    const abs = Array.from(numbering.getElementsByTagNameNS(W, 'abstractNum')).find((a) => attr(a, 'abstractNumId') === absId);
    const lvl = abs && Array.from(abs.getElementsByTagNameNS(W, 'lvl')).find((l) => attr(l, 'ilvl') === ilvl);
    if (!lvl) continue;
    let pPr = el(lvl, 'pPr');
    if (!pPr) pPr = lvl.appendChild(numbering.createElementNS(W, 'w:pPr'));
    const old = el(pPr, 'ind');
    if (old) pPr.removeChild(old);
    pPr.appendChild(ind.cloneNode(true));
  }
}

/** docx-preview only reads tab stops written on the paragraph itself; copy inherited ones onto tab-using paragraphs. */
function fixInheritedTabs(doc: Document, styles: Map<string, StyleInfo>, defaultParagraph: string | null) {
  for (const p of Array.from(doc.getElementsByTagNameNS(W, 'p'))) {
    const usesTabs = Array.from(p.getElementsByTagNameNS(W, 'tab')).some((t) => (t.parentNode as Element)?.localName === 'r');
    if (!usesTabs) continue;
    let pPr = el(p, 'pPr');
    const styleId = attr(pPr && el(pPr, 'pStyle'), 'val') ?? defaultParagraph;
    const inherited = inheritedTabs(styleId, styles);
    if (!inherited.length) continue;

    if (!pPr) pPr = p.insertBefore(doc.createElementNS(W, 'w:pPr'), p.firstChild);
    const own = el(pPr, 'tabs');
    const merged = new Map<string, Element>();
    for (const t of inherited) merged.set(attr(t, 'pos') ?? '', t);
    for (const t of own ? Array.from(own.getElementsByTagNameNS(W, 'tab')) : []) {
      if (attr(t, 'val') === 'clear') merged.delete(attr(t, 'pos') ?? '');
      else merged.set(attr(t, 'pos') ?? '', t);
    }
    const tabs = doc.createElementNS(W, 'w:tabs');
    for (const t of merged.values()) tabs.appendChild(doc.importNode(t, true));
    if (own) pPr.replaceChild(tabs, own);
    else pPr.insertBefore(tabs, el(pPr, 'pStyle')?.nextSibling ?? pPr.firstChild);
  }
}

/**
 * An empty paragraph that only carries a section break (e.g. where a two-column block starts)
 * shows nothing in Word, but docx-preview draws its bullet and a full blank line.
 */
function collapseSectionBreakParagraphs(doc: Document) {
  for (const p of Array.from(doc.getElementsByTagNameNS(W, 'p'))) {
    const pPr = el(p, 'pPr');
    if (!pPr || !el(pPr, 'sectPr')) continue;
    const hasText = Array.from(p.getElementsByTagNameNS(W, 't')).some((t) => t.textContent?.trim());
    if (hasText) continue;
    for (const name of ['numPr', 'spacing']) {
      const old = el(pPr, name);
      if (old) pPr.removeChild(old);
    }
    const numPr = doc.createElementNS(W, 'w:numPr');
    const numId = numPr.appendChild(doc.createElementNS(W, 'w:numId'));
    numId.setAttributeNS(W, 'w:val', '0'); // numId 0 = no list
    const spacing = doc.createElementNS(W, 'w:spacing');
    for (const [k, v] of [['before', '0'], ['after', '0'], ['line', '20'], ['lineRule', 'exact']]) spacing.setAttributeNS(W, `w:${k}`, v);
    pPr.insertBefore(spacing, pPr.firstChild);
    pPr.insertBefore(numPr, pPr.firstChild);
  }
}

async function readXml(zip: JSZip, path: string): Promise<Document | null> {
  const f = zip.file(path);
  return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null;
}

/** Returns a preview-only copy of the .docx with Word's inheritance made explicit, plus the font names it uses. */
async function prepare(bytes: Uint8Array): Promise<{ data: Uint8Array; fonts: string[]; extraCss: string }> {
  const zip = await JSZip.loadAsync(bytes);
  const doc = await readXml(zip, 'word/document.xml');
  const stylesDoc = await readXml(zip, 'word/styles.xml');
  const numbering = await readXml(zip, 'word/numbering.xml');
  const fontTable = await readXml(zip, 'word/fontTable.xml');

  if (doc && stylesDoc) {
    const { map, defaultParagraph } = readStyles(stylesDoc);
    if (numbering) {
      fixListIndents(map, numbering);
      zip.file('word/numbering.xml', new XMLSerializer().serializeToString(numbering));
    }
    fixInheritedTabs(doc, map, defaultParagraph);
    collapseSectionBreakParagraphs(doc);
    zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  }

  const fonts = fontTable ? Array.from(fontTable.getElementsByTagNameNS(W, 'font')).map((f) => attr(f, 'name') ?? '').filter(Boolean) : [];
  return { data: await zip.generateAsync({ type: 'uint8array' }), fonts, extraCss: stylesDoc ? letterSpacingCss(stylesDoc) : '' };
}

/**
 * Loads free look-alikes for Microsoft fonts and any Google Fonts the document names,
 * and waits for them: tab stops are measured once after rendering, so fonts must be ready first.
 */
async function loadFonts(fonts: string[]): Promise<void> {
  const families = new Set<string>();
  for (const f of fonts) {
    const sub = FONT_SUBSTITUTES[f.toLowerCase()];
    if (sub) families.add(sub);
    else if (!NOT_ON_GOOGLE.test(f)) families.add(f);
  }
  // One stylesheet per family: an unknown family fails on its own instead of breaking the rest.
  const loads = [...families].map(async (family) => {
    const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
    if (!document.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      await new Promise<void>((resolve) => {
        link.onload = link.onerror = () => resolve();
        document.head.appendChild(link);
      });
    }
    await Promise.all([`400 16px "${family}"`, `700 16px "${family}"`].map((f) => document.fonts.load(f).catch(() => [])));
  });
  // Offline or slow network: render with fallbacks rather than wait forever.
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 4000))]);
}

/**
 * Puts each substitute right after the font it replaces: "Garamond, Verdana" → "Garamond, 'EB Garamond', Verdana".
 * Appending at the end isn't enough, because a later installed font (here Verdana) would win.
 */
function addFontFallbacks(css: string): string {
  return css.replace(/(font-family\s*:\s*|--docx-[\w-]+-font\s*:\s*)([^;}]+)/g, (_m, prop: string, value: string) => {
    const families = value.split(',').flatMap((raw) => {
      const sub = FONT_SUBSTITUTES[raw.trim().replace(/^['"]|['"]$/g, '').toLowerCase()];
      return sub && !value.includes(sub) ? [raw, ` '${sub}'`] : [raw];
    });
    return prop + families.join(',');
  });
}

/**
 * docx-preview ignores character spacing (w:spacing in run properties), which resumes use for
 * letter-spaced names and headings. Recreate it as letter-spacing on its per-style CSS classes.
 */
function letterSpacingCss(stylesDoc: Document): string {
  const rules: string[] = [];
  for (const st of Array.from(stylesDoc.getElementsByTagNameNS(W, 'style'))) {
    const id = attr(st, 'styleId');
    const rPr = el(st, 'rPr');
    const spacing = Number(attr(rPr && el(rPr, 'spacing'), 'val'));
    if (!id || !spacing) continue;
    const cls = `.docx_${id.replace(/[ .]+/g, '-').replace(/[&]+/g, 'and').toLowerCase()}`;
    // twentieths of a point; paragraph styles apply to the runs inside them
    rules.push(`${cls}, ${cls} span { letter-spacing: ${spacing / 20}pt; }`);
  }
  return rules.join('\n');
}

export async function renderDocxPreview(bytes: Uint8Array, container: HTMLElement): Promise<void> {
  const [{ renderAsync }, { data, fonts, extraCss }] = await Promise.all([import('docx-preview'), prepare(bytes)]);
  await loadFonts(fonts);
  container.innerHTML = '';
  await renderAsync(new Blob([data as BlobPart]), container, undefined, {
    inWrapper: true,
    breakPages: true,
    // docx-preview starts a new page at every section when this is true (even continuous ones).
    ignoreLastRenderedPageBreak: false,
    // Needed for right-aligned tab stops (dates on the right of job lines).
    experimental: true,
    renderComments: false,
  });
  container.querySelectorAll('style').forEach((s) => (s.textContent = addFontFallbacks(s.textContent ?? '')));
  container.querySelectorAll<HTMLElement>('[style*="font-family"]').forEach((e) => e.setAttribute('style', addFontFallbacks(e.getAttribute('style') ?? '')));
  if (extraCss) container.appendChild(Object.assign(document.createElement('style'), { textContent: extraCss }));
  // docx-preview measures tab stops on screen ~500ms after rendering; callers must not
  // scale the pages until that has happened, or every tab width is off by the scale.
  await new Promise((r) => setTimeout(r, TAB_LAYOUT_DELAY_MS));
}

const TAB_LAYOUT_DELAY_MS = 700;
