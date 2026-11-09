import { useMemo, useState } from 'react';
import {
  ArrowSquareOut,
  Check,
  Copy,
  EnvelopeSimple,
  GithubLogo,
  GitlabLogo,
  Globe,
  type Icon,
  LinkedinLogo,
  Phone,
  Code,
  XLogo,
} from '@phosphor-icons/react';
import { extractResumeLinks, type ResumeLinkKind } from '../../resume/links';

const ICONS: Record<ResumeLinkKind, Icon> = {
  linkedin: LinkedinLogo,
  github: GithubLogo,
  gitlab: GitlabLogo,
  leetcode: Code,
  twitter: XLogo,
  email: EnvelopeSimple,
  phone: Phone,
  website: Globe,
};

interface QuickLinksProps {
  latex: string;
}

/**
 * Lists links found in the resume with Copy / Open buttons.
 * Purely a convenience for filling job applications; not used in the prompt.
 */
export function QuickLinks({ latex }: QuickLinksProps) {
  const links = useMemo(() => extractResumeLinks(latex), [latex]);
  const [copied, setCopied] = useState<string | null>(null);

  if (links.length === 0) return null;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied((c) => (c === value ? null : c)), 1500);
    } catch {
      // Clipboard unavailable; ignore
    }
  };

  const btn =
    'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors';

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Quick Links</label>
      <div className="flex flex-col divide-y divide-zinc-200/70 dark:divide-white/5 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-xl">
        {links.map((link) => {
          const LinkIcon = ICONS[link.kind];
          const isCopied = copied === link.value;
          return (
            <div key={link.href} className="flex items-center gap-2 px-3 py-1.5">
              <LinkIcon size={16} className="shrink-0 text-zinc-500 dark:text-zinc-400" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 leading-tight">{link.label}</p>
                <p className="text-[10px] text-zinc-500 truncate leading-tight" title={link.value}>
                  {link.value.replace(/^https?:\/\/(www\.)?/, '')}
                </p>
              </div>
              <button type="button" onClick={() => copy(link.value)} className={btn} title="Copy">
                {isCopied ? <Check size={13} weight="bold" className="text-emerald-500" /> : <Copy size={13} />}
                {isCopied ? 'Copied' : 'Copy'}
              </button>
              <a href={link.href} target="_blank" rel="noopener noreferrer" className={btn} title="Open">
                <ArrowSquareOut size={13} />
                Open
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
