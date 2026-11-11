/**
 * The text protocol between ResTail and the AI for Word resumes.
 * DOM-free so the service worker, preview page and popup can all use it.
 *
 * Outline sent to the AI, one paragraph per line:
 *   [p4] • Trained 2 administrative assistants during a period...
 *   [p5] (locked) linkedin.com/in/jane
 * Reply from the AI, only for paragraphs it changes:
 *   [p4] • Mentored 2 administrative assistants...
 *   [p4+] • A new bullet inserted after p4, formatted like p4
 *   [p6] <delete>
 */

export const TAB = '<tab>';
export const BREAK = '<br>';
export const DELETE = '<delete>';

export interface DocxEdits {
  /** New text per paragraph id. */
  replace: Map<string, string>;
  /** Paragraph ids to remove. */
  remove: Set<string>;
  /** New paragraphs to add after an id, in order. */
  insertAfter: Map<string, string[]>;
}

const LINE = /^\s*\[(p\d+)(\+*)\]\s?(.*)$/;

export function parseDocxEdits(reply: string): DocxEdits {
  const edits: DocxEdits = { replace: new Map(), remove: new Set(), insertAfter: new Map() };
  for (const raw of reply.split(/\r?\n/)) {
    const m = raw.match(LINE);
    if (!m) continue;
    const [, id, plus] = m;
    // Drop tags the AI may echo back from the outline: "(locked)", "(max 96 chars)".
    const text = m[3].replace(/^\((locked|max \d+ chars)\)\s*/, '').trim();
    if (plus) {
      if (text && text !== DELETE) edits.insertAfter.set(id, [...(edits.insertAfter.get(id) ?? []), text]);
    } else if (text === DELETE || text === '') {
      edits.remove.add(id);
    } else {
      edits.replace.set(id, text);
    }
  }
  return edits;
}

export function countEdits(e: DocxEdits): number {
  let n = e.replace.size + e.remove.size;
  for (const list of e.insertAfter.values()) n += list.length;
  return n;
}
