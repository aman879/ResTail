const DOC_START = '\\documentclass';
const DOC_END = '\\end{document}';

/**
 * Pulls the LaTeX document out of an AI response, ignoring any chatter around it.
 * Handles markdown fences (when the raw text has them), several code blocks
 * joined together, and explanations before or after the document.
 */
export function extractLatex(rawResponse: string): string {
  let latex = rawResponse.trim();

  // Prefer the fenced block that holds the document, if fences survived.
  const fences = [...latex.matchAll(/```(?:latex|tex)?[^\S\n]*\n?([\s\S]*?)```/gi)].map((m) => m[1]);
  const docFence = fences.find((f) => f.includes(DOC_START));
  if (docFence) latex = docFence.trim();
  else if (fences.length === 1) latex = fences[0].trim();

  // Cut to exactly \documentclass ... \end{document}.
  const start = latex.indexOf(DOC_START);
  const end = latex.lastIndexOf(DOC_END);
  if (start !== -1 && end > start) {
    latex = latex.slice(start, end + DOC_END.length);
  }

  return latex;
}

export function validateLatex(latex: string): boolean {
  const hasDocumentClass = latex.includes(DOC_START);
  const hasBeginDocument = latex.includes('\\begin{document}');
  const hasEndDocument = latex.includes(DOC_END);

  return hasDocumentClass && hasBeginDocument && hasEndDocument;
}
