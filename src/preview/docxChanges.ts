import type { DocxParagraph } from '../resume/docx';
import { BREAK, TAB, type DocxEdits } from '../resume/docxEdits';

export type ChangeKind = 'edit' | 'add' | 'remove' | 'locked';

export interface Change {
  kind: ChangeKind;
  before?: string;
  after?: string;
  /** Characters added, when enough to risk an extra wrapped line. */
  grewBy?: number;
}

/** Growth beyond both limits risks an extra wrapped line in a fixed Word layout. */
const GROWTH_RATIO = 1.15;
const MIN_EXTRA_CHARS = 12;

export const visibleLength = (t: string) => t.split('**').join('').split(TAB).join(' ').split(BREAK).join(' ').length;

/** What the AI changed, in document order, compared with the original paragraphs. */
export function listChanges(paragraphs: DocxParagraph[], edits: DocxEdits): Change[] {
  const changes: Change[] = [];
  for (const p of paragraphs) {
    const touched = edits.replace.has(p.id) || edits.remove.has(p.id) || edits.insertAfter.has(p.id);
    if (!touched) continue;
    const before = (p.bullet ? '• ' : '') + p.text;
    if (p.locked) {
      changes.push({ kind: 'locked', before });
      continue;
    }
    if (edits.remove.has(p.id)) {
      changes.push({ kind: 'remove', before });
    } else if (edits.replace.has(p.id)) {
      const after = edits.replace.get(p.id)!;
      if (after.trim() !== before.trim()) {
        const added = visibleLength(after) - visibleLength(before);
        const risky = visibleLength(after) / Math.max(1, visibleLength(before)) > GROWTH_RATIO && added > MIN_EXTRA_CHARS;
        changes.push({ kind: 'edit', before, after, grewBy: risky ? added : undefined });
      }
    }
    for (const added of edits.insertAfter.get(p.id) ?? []) changes.push({ kind: 'add', after: added });
  }
  return changes;
}
