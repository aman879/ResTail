import JSZip from 'jszip';
import { BREAK, TAB, type DocxEdits } from './docxEdits';

/**
 * Tailors a Word resume in place: only the text of paragraphs changes, and
 * every new run copies the formatting of the run it replaces, so styles,
 * layout, tables, text boxes and images stay exactly as the user made them.
 *
 * Uses only DOM Level 2 APIs (DOMParser, XMLSerializer, getElementsByTagNameNS)
 * so it runs in extension pages and in Node tests with xmldom.
 */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const DOC_PATH = 'word/document.xml';

/** Paragraphs containing these can't be safely rewritten (links, fields, tracked changes). */
const LOCKING = new Set(['hyperlink', 'fldSimple', 'fldChar', 'instrText', 'ins', 'del', 'drawing', 'pict', 'object']);
/** rPr children that differ between runs without being visible formatting. */
const NOISE = new Set(['lang', 'noProof', 'webHidden', 'rtl', 'cs', 'specVanish']);

export interface DocxParagraph {
  id: string;
  el: Element;
  /** The same text box paragraph in the legacy (VML) fallback markup, kept in sync. */
  mirrors: Element[];
  locked: boolean;
  bullet: boolean;
  /** Text with "**" around runs formatted differently from the rest, plus <tab>/<br> tokens. */
  text: string;
}

export interface LoadedDocx {
  zip: JSZip;
  doc: Document;
}

// ---------------------------------------------------------------- DOM helpers

const isW = (n: Node | null, name: string): n is Element =>
  !!n && n.nodeType === 1 && (n as Element).namespaceURI === W_NS && (n as Element).localName === name;

function list(nodes: { length: number; item(i: number): Node | null }): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes.item(i);
    if (n && n.nodeType === 1) out.push(n as Element);
  }
  return out;
}

function children(el: Element): Element[] {
  return list(el.childNodes);
}

function closestParagraph(n: Node): Element | null {
  let p = n.parentNode;
  while (p) {
    if (isW(p, 'p')) return p;
    p = p.parentNode;
  }
  return null;
}

function insideFallback(n: Node): boolean {
  let p = n.parentNode;
  while (p) {
    if (p.nodeType === 1 && (p as Element).namespaceURI === MC_NS && (p as Element).localName === 'Fallback') return true;
    p = p.parentNode;
  }
  return false;
}

/** Elements inside a paragraph that belong to it, not to a nested text box paragraph. */
function own(p: Element, localName: string): Element[] {
  return list(p.getElementsByTagNameNS(W_NS, localName)).filter((e) => closestParagraph(e) === p);
}

function runText(r: Element): string {
  let s = '';
  for (const c of children(r)) {
    if (c.namespaceURI !== W_NS) continue;
    if (c.localName === 't') s += (c.textContent ?? '').split('\t').join(TAB);
    else if (c.localName === 'tab' || c.localName === 'ptab') s += TAB;
    else if ((c.localName === 'br' && c.getAttributeNS(W_NS, 'type') !== 'page') || c.localName === 'cr') s += BREAK;
    else if (c.localName === 'noBreakHyphen') s += '-';
  }
  return s;
}

const hasText = (r: Element) => runText(r) !== '';

function rPrOf(r: Element): Element | null {
  return children(r).find((c) => isW(c, 'rPr')) ?? null;
}

function rPrKey(rPr: Element | null): string {
  if (!rPr) return '';
  return children(rPr)
    .filter((c) => !NOISE.has(c.localName ?? ''))
    .map((c) => {
      const attrs: string[] = [];
      for (let i = 0; i < c.attributes.length; i++) {
        const a = c.attributes.item(i)!;
        attrs.push(`${a.localName}=${a.value}`);
      }
      return `${c.localName}(${attrs.sort().join(',')})`;
    })
    .sort()
    .join(';');
}

interface Formatting {
  base: Element | null;
  emph: Element | null;
  /** Number of distinct non-base formattings; more than one can't be expressed with "**". */
  extraStyles: number;
  text: string;
}

/** Splits a paragraph's runs into its dominant formatting and one "emphasis" formatting. */
function analyze(p: Element): Formatting {
  const runs = own(p, 'r').filter(hasText);
  const weight = new Map<string, { n: number; rPr: Element | null }>();
  for (const r of runs) {
    const rPr = rPrOf(r);
    const k = rPrKey(rPr);
    const e = weight.get(k);
    const len = runText(r).length;
    if (e) e.n += len;
    else weight.set(k, { n: len, rPr });
  }
  const ranked = [...weight.entries()].sort((a, b) => b[1].n - a[1].n);
  const baseKey = ranked[0]?.[0] ?? '';
  const base = ranked[0]?.[1].rPr ?? null;
  const emph = ranked[1]?.[1].rPr ?? null;

  let text = '';
  let open = false;
  for (const r of runs) {
    const isEmph = rPrKey(rPrOf(r)) !== baseKey;
    if (isEmph !== open) {
      text += '**';
      open = isEmph;
    }
    text += runText(r);
  }
  if (open) text += '**';
  return { base, emph, extraStyles: Math.max(0, ranked.length - 2), text: tidyMarkers(text) };
}

/**
 * Moves spaces out of "**" segments and drops space-only ones, so the AI sees
 * "**Regex** techniques" and "Work Experience" instead of "**Regex **techniques"
 * and "Work** **Experience". Odd segments of text.split('**') are the emphasized ones.
 */
function tidyMarkers(text: string): string {
  const parts = text.split('**');
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      out += parts[i];
      continue;
    }
    const m = parts[i].match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    out += m[2] ? `${m[1]}**${m[2]}**${m[3]}` : m[1] + m[3];
  }
  return out;
}

function isBullet(p: Element): boolean {
  const pPr = children(p).find((c) => isW(c, 'pPr'));
  if (!pPr) return false;
  if (children(pPr).some((c) => isW(c, 'numPr'))) return true;
  const style = children(pPr).find((c) => isW(c, 'pStyle'))?.getAttributeNS(W_NS, 'val') ?? '';
  return /list|bullet/i.test(style);
}

// ---------------------------------------------------------------- read

export async function loadDocx(data: ArrayBuffer | Uint8Array): Promise<LoadedDocx> {
  const zip = await JSZip.loadAsync(data);
  const file = zip.file(DOC_PATH);
  if (!file) throw new Error('This file is not a valid Word document (.docx).');
  const doc = new DOMParser().parseFromString(await file.async('string'), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Could not read this Word document.');
  return { zip, doc };
}

/** Text paragraphs in document order with stable ids (p1, p2, ...). */
export function collectParagraphs(doc: Document): DocxParagraph[] {
  // Text boxes appear twice: modern markup (mc:Choice) and a VML copy (mc:Fallback).
  const mirrorsOf = new Map<Element, Element[]>();
  for (const ac of list(doc.getElementsByTagNameNS(MC_NS, 'AlternateContent'))) {
    const choice = children(ac).find((c) => c.localName === 'Choice');
    const fallback = children(ac).find((c) => c.localName === 'Fallback');
    if (!choice || !fallback) continue;
    const a = list(choice.getElementsByTagNameNS(W_NS, 'p'));
    const b = list(fallback.getElementsByTagNameNS(W_NS, 'p'));
    if (a.length === b.length) a.forEach((p, i) => mirrorsOf.set(p, [...(mirrorsOf.get(p) ?? []), b[i]]));
  }

  const out: DocxParagraph[] = [];
  for (const p of list(doc.getElementsByTagNameNS(W_NS, 'p'))) {
    if (insideFallback(p)) continue;
    const f = analyze(p);
    const plain = f.text.split('**').join('').split(TAB).join(' ').split(BREAK).join(' ').trim();
    if (!plain) continue;
    const locked = f.extraStyles > 0 || [...LOCKING].some((name) => own(p, name).length > 0);
    out.push({
      id: `p${out.length + 1}`,
      el: p,
      mirrors: mirrorsOf.get(p) ?? [],
      locked,
      bullet: isBullet(p),
      text: locked ? f.text.split('**').join('') : f.text,
    });
  }
  return out;
}

/** Visible characters, ignoring markers, as a reader would count them. */
function visibleLength(text: string): number {
  return text.split('**').join('').split(TAB).join(' ').split(BREAK).join(' ').length;
}

/**
 * The paragraph list the AI sees. Editable lines carry an explicit character
 * limit: models follow a number far better than "keep it about the same length",
 * and in a fixed Word layout a longer line can wrap and push the page over.
 */
export function buildOutline(paragraphs: DocxParagraph[]): string {
  return paragraphs
    .map((p) => {
      const tag = p.locked ? ' (locked)' : ` (max ${Math.ceil(visibleLength(p.text) * 1.08) + 2} chars)`;
      return `[${p.id}]${tag} ${p.bullet ? '• ' : ''}${p.text}`;
    })
    .join('\n');
}

// ---------------------------------------------------------------- write

function makeRuns(doc: Document, text: string, f: Formatting): Element[] {
  const runs: Element[] = [];
  const parts = f.emph ? text.split('**') : [text.split('**').join('')];
  parts.forEach((part, i) => {
    if (!part) return;
    const rPr = i % 2 === 1 ? f.emph : f.base;
    const r = doc.createElementNS(W_NS, 'w:r');
    if (rPr) r.appendChild(rPr.cloneNode(true));
    for (const piece of part.split(/(<tab>|<br>)/)) {
      if (!piece) continue;
      if (piece === TAB) r.appendChild(doc.createElementNS(W_NS, 'w:tab'));
      else if (piece === BREAK) r.appendChild(doc.createElementNS(W_NS, 'w:br'));
      else {
        const t = doc.createElementNS(W_NS, 'w:t');
        t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
        t.appendChild(doc.createTextNode(piece));
        r.appendChild(t);
      }
    }
    runs.push(r);
  });
  return runs;
}

function setParagraphText(p: Element, text: string, bullet: boolean) {
  const doc = p.ownerDocument!;
  const f = analyze(p);
  const clean = bullet ? text.replace(/^[•●▪-]\s+/, '') : text;
  const runs = own(p, 'r').filter(hasText);
  const newRuns = makeRuns(doc, clean, f);
  if (runs.length) {
    const anchor = runs[0];
    for (const r of newRuns) anchor.parentNode!.insertBefore(r, anchor);
    for (const r of runs) r.parentNode!.removeChild(r);
  } else {
    for (const r of newRuns) p.appendChild(r);
  }
}

function removeParagraph(p: Element) {
  const parent = p.parentNode as Element | null;
  if (!parent) return;
  // Table cells and text boxes must keep at least one paragraph.
  const siblings = children(parent).filter((c) => isW(c, 'p'));
  if ((isW(parent, 'tc') || isW(parent, 'txbxContent')) && siblings.length <= 1) {
    for (const r of own(p, 'r').filter(hasText)) r.parentNode!.removeChild(r);
  } else {
    parent.removeChild(p);
  }
}

function insertCopyAfter(p: Element, after: Element, text: string, bullet: boolean): Element {
  const copy = p.cloneNode(true) as Element;
  setParagraphText(copy, text, bullet);
  after.parentNode!.insertBefore(copy, after.nextSibling);
  return copy;
}

/** Applies the AI's edits to the document. Locked paragraphs are never changed. */
export function applyEdits(doc: Document, edits: DocxEdits): { applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;
  for (const para of collectParagraphs(doc)) {
    const targets = [para.el, ...para.mirrors];
    const wants = edits.remove.has(para.id) || edits.replace.has(para.id) || edits.insertAfter.has(para.id);
    if (!wants) continue;
    if (para.locked) {
      skipped++;
      continue;
    }

    const inserts = edits.insertAfter.get(para.id) ?? [];
    targets.forEach((el) => {
      let last = el;
      for (const t of inserts) last = insertCopyAfter(el, last, t, para.bullet);
    });
    applied += inserts.length;

    if (edits.remove.has(para.id)) {
      targets.forEach(removeParagraph);
      applied++;
    } else if (edits.replace.has(para.id)) {
      const text = edits.replace.get(para.id)!;
      targets.forEach((el) => setParagraphText(el, text, para.bullet));
      applied++;
    }
  }
  return { applied, skipped };
}

export async function saveDocx({ zip, doc }: LoadedDocx): Promise<Uint8Array> {
  zip.file(DOC_PATH, new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------- base64 (for chrome.storage)

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
