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
