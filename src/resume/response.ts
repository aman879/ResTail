import { parseDocxEdits, countEdits } from './docxEdits';
import { extractLatex, validateLatex } from './latex';

/** What a provider should wait for before treating the AI reply as complete. */
export type ResponseKind = 'latex' | 'docx-edits';

export function isCompleteResponse(text: string, kind: ResponseKind = 'latex'): boolean {
  return kind === 'docx-edits' ? countEdits(parseDocxEdits(text)) > 0 : validateLatex(extractLatex(text));
}
