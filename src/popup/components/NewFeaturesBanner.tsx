import { Sparkle, X } from '@phosphor-icons/react';

interface NewFeaturesBannerProps {
  onOpenWhatsNew: () => void;
  onDismiss: () => void;
}

/** Shown once to users who updated from a version without PDF and Word support. */
export function NewFeaturesBanner({ onOpenWhatsNew, onDismiss }: NewFeaturesBannerProps) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[12px] leading-snug text-zinc-600 dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-400">
      <Sparkle size={16} weight="fill" className="mt-px shrink-0 text-zinc-900 dark:text-zinc-100" />
      <p className="flex-1">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">New:</span> upload your resume as a PDF or Word file,
        not just LaTeX.{' '}
        <button
          onClick={onOpenWhatsNew}
          className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:text-zinc-100 dark:decoration-zinc-600 dark:hover:decoration-zinc-100"
        >
          See what's new
        </button>
      </p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
