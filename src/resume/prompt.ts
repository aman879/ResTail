export const LOCKED_PROMPT = `Please act as an expert resume writer and tailor the provided resume for the specific job description. 

Your goal is to optimize the resume's alignment with the job requirements while strictly maintaining the factual accuracy of the candidate's experience.

Guidelines for tailoring:
1. Truthfulness is paramount. Do not invent or assume any experience, skills, employers, dates, or metrics. Only use information that is already supported by the provided resume.
2. You may rewrite, reorder, and improve the wording of existing bullet points to better highlight the candidate's relevant skills.
3. Incorporate terminology and keywords from the job description naturally, but only if they accurately reflect the candidate's existing experience. Aim for high ATS compatibility.
4. Keep the exact structural order of the resume (do not swap the sequence of jobs or education).

LaTeX Formatting Guidelines:
1. The input resume is provided in LaTeX format. You must preserve the original LaTeX structure, packages, and styling perfectly.
2. Only modify the actual text content within the sections, bullet points, and descriptions. Do not alter document classes, custom macros, or layout.
3. Ensure the final LaTeX code is completely valid and can compile without errors.

Output format:
Please provide the tailored resume as a single, complete LaTeX document wrapped inside a markdown \`\`\`latex code block. Do not include any conversational text before or after the code block, just the modified LaTeX document.`;

/**
 * One-time PDF → LaTeX conversion. No tailoring here: the result becomes the
 * resume's saved source, and tailoring then runs on it like any .tex upload.
 */
export const PDF_CONVERT_PROMPT = `Please act as an expert LaTeX typesetter. Convert the resume below, extracted from a PDF, into a LaTeX document that looks as close as possible to the original PDF design.

Content rules:
1. Do not tailor, rewrite, shorten, or add anything. Reproduce every word of the content exactly as given, in the same order, sections, and columns.
2. The only text changes allowed are fixing extraction artifacts: words split by line-end hyphenation, broken ligatures, or stray spaces.
3. Keep the result on the same number of pages as the original.

Input format:
The resume was extracted from a PDF. "LAYOUT" and "TEXT STYLES" are measurements of the original design; "CONTENT" is the text in reading order, where [Sx] tells you which text style each line uses. Text extraction can leave small artifacts (for example a broken word); fix those silently. If "HYPERLINKS IN THE ORIGINAL PDF" is present, link the matching contact/profile text to those URLs with \\href.

Recreating the design:
1. Use \\documentclass{article} with geometry set to the given paper size and margins, and the exact font preamble line given in LAYOUT. Only use packages available in TeX Live for pdflatex: geometry, xcolor, hyperref, enumitem, titlesec, paracol, tcolorbox, tikz, fontawesome5, eso-pic. Never use fontspec or custom .cls files, and include no images.
2. Define every color listed in LAYOUT and TEXT STYLES with \\definecolor{name}{HTML}{RRGGBB} and apply the right color to each line.
3. Apply each text style exactly: \\fontsize{size}{baseline}\\selectfont with the baseline distance from LAYOUT's vertical rhythm (1.25×size if none is given), the weight (\\bfseries for SemiBold/Bold/ExtraBold, \\mdseries for Regular/Medium), italics, ALL CAPS text written in capitals, and letter-spaced headings where they look letter-spaced. Create one macro per style and reuse it.
4. For 2 columns use paracol: \\columnratio{left share} matching the measured widths, \\setlength{\\columnsep}{gutter}, and if a vertical divider is listed set \\setlength{\\columnseprule}{thickness} with \\colseprulecolor{color}. Put FULL WIDTH content before/after the paracol environment and each line in the column it is listed under.
5. Backgrounds, with \\usepackage[most]{tcolorbox} (always include "enhanced,frame hidden" or a dark border appears):
   - "on full-width bar": \\begin{tcolorbox}[enhanced,frame hidden,colback=COLOR,sharp corners,boxsep=0pt,left=4pt,right=4pt,top=2pt,bottom=2pt,before skip=4pt,after skip=2pt]TEXT\\end{tcolorbox}
   - "inside shaded box": one \\begin{tcolorbox}[enhanced,frame hidden,colback=COLOR,arc=4pt,boxsep=0pt,left=6pt,right=6pt,top=6pt,bottom=6pt] around the whole block \\end{tcolorbox}
   - "inside chip/tag": \\tcbox[enhanced,on line,frame hidden,colback=COLOR,arc=2pt,boxsep=0pt,left=5pt,right=5pt,top=3pt,bottom=3pt]{TEXT}, chips separated by \\hspace{4pt}, rows of chips separated by \\\\[4pt], grouped like the original rows.
6. A "[horizontal rule ...]" item is its own paragraph: \\par\\vspace{6pt}\\noindent\\textcolor{COLOR}{\\rule{\\linewidth}{THICKNESS}}\\par\\vspace{6pt}
   A page frame is drawn with eso-pic + tikz: \\AddToShipoutPictureBG{\\begin{tikzpicture}[remember picture,overlay]\\fill[FRAMECOLOR] (current page.south west) rectangle (current page.north east);\\fill[white] ([shift={(Wpt,Wpt)}]current page.south west) rectangle ([shift={(-Wpt,-Wpt)}]current page.north east);\\end{tikzpicture}}
7. Lines marked "with icon": put them in a \\begin{tabular}{@{}c@{\\hspace{8pt}}l@{}} with a matching fontawesome5 icon in the accent color (\\faPhone, \\faEnvelope[regular], \\faMapMarker*, \\faLinkedin, \\faGithub, \\faGlobe) followed by the text, one row per line.
8. Bullets: itemize with enumitem (leftmargin=1.3em, itemsep=2pt, topsep=4pt) and the bullet in the original color. Follow the paragraph alignment given in LAYOUT everywhere, including inside tcolorboxes (repeat \\raggedright inside them when ragged).
9. Ensure the LaTeX is complete and compiles with pdflatex without errors.

Output format:
Please provide the converted resume as a single, complete LaTeX document wrapped inside a markdown \`\`\`latex code block. Do not include any conversational text before or after the code block, just the LaTeX document.`;

export const DEFAULT_EDITABLE_PROMPT = `Tailor my resume for the provided job description.

Optimize the resume for this specific role while keeping it completely truthful.

Priorities:

1. Match the resume to the most important requirements in the job description.
2. Highlight relevant experience, projects, technologies, and achievements that already exist in my resume.
3. Rewrite weak or generic bullet points to be more specific and relevant where the original information supports it.
4. Prioritize the skills and experience most relevant to this position.
5. Reduce or remove less relevant information when necessary to keep the resume concise.
6. Improve ATS keyword alignment naturally to achieve at least a 9/10 (90%+) match score without keyword stuffing.
7. Use terminology from the job description when it accurately describes experience already present in my resume.
8. Keep the resume professional and concise.
9. Preserve the existing LaTeX formatting and overall design exactly. Do not alter styling, margins, fonts, spacing, packages, or document class. Only edit the text content of the resume.
10. Do not add anything that is not supported by my original resume.

Do not change the candidate's actual employment history, education, dates, employers, or other factual information.

The final result should look like a naturally tailored resume written specifically for this job, not a generic resume with keywords inserted.`;

/**
 * Appended after the resume so the output rule is the last thing the AI reads;
 * long prompts (especially PDF layouts) make models forget rules given at the top.
 */
export const OUTPUT_REMINDER = `FINAL INSTRUCTION (most important):
Reply with ONLY the complete LaTeX document inside a single \`\`\`latex code block, starting with \\documentclass and ending with \\end{document}.
Do not write anything before or after the code block: no greeting, no summary of changes, no explanations, no notes, no questions.`;

const LATEX_OUTPUT_NOTES = {
  pdf: 'OUTPUT FILE: Your LaTeX is compiled straight to a PDF with pdflatex, so it must compile without errors.',
  tex: 'OUTPUT FILE: The user downloads your .tex file to keep editing it themselves, so keep the source clean and readable: preserve the original comments, indentation, macro definitions and line structure, and change only the text that needs tailoring. It must still compile with pdflatex without errors.',
} as const;

/** Full prompt for tailoring a LaTeX resume into a PDF or an editable .tex file. */
export function buildTailorPrompt(latex: string, customInstructions: string, jobDescription: string, output: 'pdf' | 'tex' = 'pdf'): string {
  return `${LOCKED_PROMPT}\n\nUSER'S CUSTOM PROMPT:\n${customInstructions}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nORIGINAL RESUME:\n${latex}\n\n${LATEX_OUTPUT_NOTES[output]}\n\n${OUTPUT_REMINDER}`;
}

/** Full prompt for the one-time PDF → LaTeX conversion. */
export function buildConvertPrompt(pdfExtract: string): string {
  return `${PDF_CONVERT_PROMPT}\n\nRESUME EXTRACTED FROM PDF:\n${pdfExtract}\n\n${OUTPUT_REMINDER}`;
}

/** Tailoring prompt for Word resumes: the AI edits paragraph text only; ResTail keeps all formatting. */
export const DOCX_LOCKED_PROMPT = `Please act as an expert resume writer and tailor the provided resume for the specific job description.

Your goal is to optimize the resume's alignment with the job requirements while strictly maintaining the factual accuracy of the candidate's experience.

Guidelines for tailoring:
1. Truthfulness is paramount. Do not invent or assume any experience, skills, employers, dates, or metrics. Only use information that is already supported by the provided resume.
2. You may rewrite and improve the wording of existing paragraphs and bullet points to better highlight the candidate's relevant skills.
3. Incorporate terminology and keywords from the job description naturally, but only if they accurately reflect the candidate's existing experience. Aim for high ATS compatibility.
4. Do not change the candidate's name, contact details, job titles, employers, locations, dates, or section headings.

Input format:
The resume is a Word document, listed one paragraph per line as "[id] text". The formatting (fonts, colors, layout) is kept automatically, so work with the text only and ignore any instructions about LaTeX.
- "**" marks text with different formatting from the rest of the paragraph (usually a bold label). Keep the markers around the matching words.
- "<tab>" is a tab used for alignment (for example before dates) and "<br>" is a line break. Keep them where they are.
- "•" at the start marks a bullet point. Keep it.
- Paragraphs marked "(locked)" contain links or special fields. Never output them.

Length (very important, the layout is fixed):
- Every editable line shows "(max N chars)". Your rewritten text for that line must be at most N characters (not counting ** markers). Longer lines wrap onto an extra line and break the page layout. Do not copy the "(max N chars)" tag into your reply.
- You may remove a weak bullet with "[id] <delete>" or add at most one bullet per job with "[id+] • text" (inserted after [id], formatted like it). Keep the total length about the same.

Output format:
Reply with only the paragraphs you change, one per line, as "[id] new text", inside a single \`\`\`text code block.`;

export const DOCX_OUTPUT_REMINDER = `FINAL INSTRUCTION (most important):
Reply with ONLY a single \`\`\`text code block containing the changed paragraphs, one per line, each starting with its [id]. Do not write anything before or after the code block: no greeting, no summary of changes, no explanations, no notes, no questions.`;

/** Full prompt for tailoring a Word resume from its paragraph outline. */
export function buildDocxTailorPrompt(outline: string, customInstructions: string, jobDescription: string): string {
  return `${DOCX_LOCKED_PROMPT}\n\nUSER'S CUSTOM PROMPT:\n${customInstructions}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nORIGINAL RESUME (Word paragraphs):\n${outline}\n\n${DOCX_OUTPUT_REMINDER}`;
}
