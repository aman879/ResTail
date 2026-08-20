export function extractLatex(rawResponse: string): string {
  let latex = rawResponse.trim();
  
  // Remove markdown code fences if they exist
  const codeFenceMatch = latex.match(/```(?:latex)?\s*([\s\S]*?)```/i);
  if (codeFenceMatch && codeFenceMatch[1]) {
    latex = codeFenceMatch[1].trim();
  }

  return latex;
}

export function validateLatex(latex: string): boolean {
  const hasDocumentClass = latex.includes('\\documentclass');
  const hasBeginDocument = latex.includes('\\begin{document}');
  const hasEndDocument = latex.includes('\\end{document}');

  return hasDocumentClass && hasBeginDocument && hasEndDocument;
}
