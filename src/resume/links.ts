export type ResumeLinkKind =
  | 'linkedin'
  | 'github'
  | 'gitlab'
  | 'leetcode'
  | 'twitter'
  | 'email'
  | 'phone'
  | 'website';

export interface ResumeLink {
  kind: ResumeLinkKind;
  /** Display label, e.g. "LinkedIn" or "portfolio.dev" */
  label: string;
  /** What gets copied: the URL, or the bare email / phone number */
  value: string;
  /** What "Open" navigates to (https://, mailto:, tel:) */
  href: string;
}

const KNOWN_SITES: { kind: ResumeLinkKind; label: string; pattern: RegExp }[] = [
  { kind: 'linkedin', label: 'LinkedIn', pattern: /(^|\.)linkedin\.com$/i },
  { kind: 'github', label: 'GitHub', pattern: /(^|\.)github\.(com|io)$/i },
  { kind: 'gitlab', label: 'GitLab', pattern: /(^|\.)gitlab\.com$/i },
  { kind: 'leetcode', label: 'LeetCode', pattern: /(^|\.)leetcode\.(com|cn)$/i },
  { kind: 'twitter', label: 'X / Twitter', pattern: /(^|\.)(twitter|x)\.com$/i },
];

/** Undo common LaTeX escapes that show up inside URLs. */
function unescapeLatex(s: string): string {
  return s
    .replace(/\\textasciitilde(\{\})?/g, '~')
    .replace(/\\~(\{\})?/g, '~')
    .replace(/\\([_#%&$])/g, '$1')
    .trim();
}

/** Strip LaTeX comments (unescaped % to end of line). */
function stripComments(latex: string): string {
  return latex.replace(/(^|[^\\])%.*$/gm, '$1');
}

function trimTrailingPunctuation(s: string): string {
  return s.replace(/[.,;:)\]}'"]+$/, '');
}

function dedupeKey(href: string): string {
  return href
    .toLowerCase()
    .replace(/^(https?:\/\/|mailto:|tel:)/, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function classify(raw: string): ResumeLink | null {
  const value = trimTrailingPunctuation(unescapeLatex(raw));
  if (!value) return null;

  if (/^mailto:/i.test(value) || /^[^\s@/]+@[^\s@/]+\.[a-z]{2,}$/i.test(value)) {
    const email = value.replace(/^mailto:/i, '');
    return { kind: 'email', label: 'Email', value: email, href: `mailto:${email}` };
  }

  if (/^tel:/i.test(value)) {
    const phone = value.replace(/^tel:/i, '');
    return { kind: 'phone', label: 'Phone', value: phone, href: `tel:${phone.replace(/[^\d+]/g, '')}` };
  }

  const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let host: string;
  try {
    host = new URL(href).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
  if (!host.includes('.')) return null;

  const site = KNOWN_SITES.find((s) => s.pattern.test(host));
  return site
    ? { kind: site.kind, label: site.label, value: href, href }
    : { kind: 'website', label: host, value: href, href };
}

/**
 * Pulls profile / contact links out of a LaTeX resume:
 * \href{...}, \url{...}, bare URLs, bare linkedin/github paths, and emails.
 * Results are de-duplicated and returned in order of appearance.
 */
export function extractResumeLinks(latex: string): ResumeLink[] {
  if (!latex) return [];
  const src = stripComments(latex);

  const found: { index: number; raw: string }[] = [];
  const collect = (re: RegExp, group = 0) => {
    for (const m of src.matchAll(re)) {
      found.push({ index: m.index ?? 0, raw: m[group] });
    }
  };

  collect(/\\href\s*\{([^}]*)\}/g, 1);
  collect(/\\url\s*\{([^}]*)\}/g, 1);
  collect(/(?:https?:\/\/|www\.)(?:[^\s{}\\]|\\[_#%&~])+/gi);
  collect(/\b(?:[a-z0-9-]+\.)?(?:linkedin|github|gitlab|leetcode)\.(?:com|io)\/(?:[^\s{}\\]|\\[_#%&~])+/gi);
  collect(/[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g);

  found.sort((a, b) => a.index - b.index);

  const seen = new Set<string>();
  const links: ResumeLink[] = [];
  for (const { raw } of found) {
    const link = classify(raw);
    if (!link) continue;
    const key = dedupeKey(link.href);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }
  return links;
}
