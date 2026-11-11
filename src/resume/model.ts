/**
 * The resume the user works with.
 *
 * `source` is the editable document the AI tailors; the format never changes
 * during tailoring, and every PDF is just a rendering of it. A PDF upload has
 * no editable source yet: it is converted to LaTeX once (from `pdfExtract`),
 * and that LaTeX is saved as its source and reused for every later tailoring.
 */
export type SourceFormat = 'latex' | 'docx';

/**
 * Bump whenever the popup → service worker request changes. Chrome reloads the popup
 * from disk on every open but keeps an old service worker running until the extension
 * is reloaded, so a mismatch must fail loudly instead of running the wrong flow.
 */
export const REQUEST_PROTOCOL = 3;
export type ResumeOrigin = 'tex' | 'pdf' | 'paste' | 'docx';

export interface Resume {
  /** What the user provided. */
  origin: ResumeOrigin;
  fileName: string;
  format: SourceFormat;
  /** Editable source. Empty for a PDF until its one-time conversion has run. */
  source: string;
  /** PDF only: extracted text plus measured layout, the input for the conversion. */
  pdfExtract?: string;
  /** Word only: numbered paragraph list the AI edits (`source` holds the .docx as base64). */
  docxOutline?: string;
}

/** True when the resume still needs its one-time PDF → LaTeX conversion. */
export function needsConversion(r: Resume): boolean {
  return r.origin === 'pdf' && !r.source.trim() && !!r.pdfExtract;
}

/** Any text that represents the resume's content (for validation and link extraction). */
export function resumeText(r: Resume | null): string {
  if (!r) return '';
  if (r.format === 'docx') return r.docxOutline ?? '';
  return r.source || r.pdfExtract || '';
}

/** Reads a stored resume, including the shape used by 1.3.0 pre-release dev builds. */
export function normalizeStoredResume(raw: unknown): Resume | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.source === 'string' && typeof r.origin === 'string') return r as unknown as Resume;
  if (typeof r.content === 'string' && r.content) {
    const fileName = typeof r.fileName === 'string' ? r.fileName : '';
    return r.format === 'pdf'
      ? { origin: 'pdf', fileName, format: 'latex', source: '', pdfExtract: r.content }
      : { origin: 'tex', fileName, format: 'latex', source: r.content };
  }
  return null;
}

// ---------------------------------------------------------------- output formats

export type OutputFormat = 'pdf' | 'tex' | 'docx';

export const OUTPUT_FORMATS: OutputFormat[] = ['pdf', 'tex', 'docx'];

export interface OutputOption {
  format: OutputFormat;
  enabled: boolean;
  /** Why it can't be chosen for this input. */
  reason?: string;
}

/**
 * Which outputs each input can produce accurately. Outputs stay in the input's own
 * format family: LaTeX → PDF or .tex, Word → .docx, PDF → PDF.
 */
export function outputOptions(r: Resume | null): OutputOption[] {
  const origin = r?.origin ?? 'tex';
  const allowed: Record<ResumeOrigin, Partial<Record<OutputFormat, string>>> = {
    tex: { docx: 'Word input only' },
    paste: { docx: 'Word input only' },
    pdf: { tex: 'coming soon', docx: 'Word input only' },
    docx: { pdf: 'coming soon', tex: 'LaTeX input only' },
  };
  return OUTPUT_FORMATS.map((format) => {
    const reason = allowed[origin][format];
    return { format, enabled: !reason, reason };
  });
}

/** Keeps the chosen output if this input supports it, otherwise picks the first one it does. */
export function resolveOutput(r: Resume | null, wanted: OutputFormat): OutputFormat {
  const opts = outputOptions(r);
  return opts.find((o) => o.format === wanted && o.enabled)?.format ?? opts.find((o) => o.enabled)!.format;
}
