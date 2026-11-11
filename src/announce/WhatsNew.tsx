import { useState, type ReactNode } from 'react';
import { FileCode, FileDoc, FilePdf, MagicWand, PushPin } from '@phosphor-icons/react';

/** One-time page opened when users update to the release that added PDF and Word support. */

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 px-5 py-4">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</p>
      </div>
    </li>
  );
}

export function WhatsNew() {
  const [popupFailed, setPopupFailed] = useState(false);

  const openPopup = async () => {
    try {
      await chrome.action.openPopup();
    } catch {
      // Older Chrome versions or no focused window: point to the toolbar instead.
      setPopupFailed(true);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200/70 dark:border-white/5">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-2 px-6">
          <MagicWand size={22} weight="fill" />
          <span className="text-lg font-semibold tracking-tight">ResTail</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">What's new in 1.3</span>
          <h1 className="text-3xl font-semibold tracking-tight">Tailor your resume in any format</h1>
          <p className="text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            ResTail no longer needs a LaTeX file. Upload the resume you already have, add the job description, and get a
            tailored version back.
          </p>
        </div>

        <ul className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-zinc-900/50">
          <Feature icon={<FileDoc size={20} weight="duotone" />} title="Word resumes (.docx)">
            Upload your Word file and get a tailored <span className="font-mono">.docx</span> back. Only the wording changes, so
            your fonts, layout and spacing stay exactly as you designed them. You can preview the result and see every change
            before downloading.
          </Feature>
          <Feature icon={<FilePdf size={20} weight="duotone" />} title="PDF resumes">
            Upload a PDF and ResTail rebuilds its design as closely as it can, then tailors it and gives you a PDF. The first
            run rebuilds it once; every later tailoring reuses it, so your resume looks the same each time.
          </Feature>
          <Feature icon={<FileCode size={20} weight="duotone" />} title="LaTeX, now with .tex output">
            Still using LaTeX? Everything works as before, and you can now choose to download the tailored{' '}
            <span className="font-mono">.tex</span> file instead of only the PDF.
          </Feature>
        </ul>

        <div className="flex flex-col gap-3">
          <button
            onClick={openPopup}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 py-3 text-sm font-medium text-white shadow-sm transition-[background-color,transform] hover:bg-zinc-800 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white sm:w-auto sm:self-start sm:px-6"
          >
            <MagicWand size={18} weight="bold" />
            Try it now
          </button>
          <p className={`flex items-start gap-2 text-[13px] leading-relaxed ${popupFailed ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-500 dark:text-zinc-400'}`}>
            <PushPin size={16} weight="bold" className="mt-0.5 shrink-0" />
            <span>
              {popupFailed ? 'Click the ResTail icon in your browser toolbar to start. ' : 'You can always open ResTail from your browser toolbar. '}
              Don't see it? Click the puzzle-piece icon and pin ResTail.
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}
