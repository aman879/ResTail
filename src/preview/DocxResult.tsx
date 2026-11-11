import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { DownloadSimple, Info, MagicWand, Warning, WarningCircle } from '@phosphor-icons/react';
import { applyEdits, base64ToBytes, collectParagraphs, loadDocx, saveDocx } from '../resume/docx';
import { BREAK, TAB, parseDocxEdits } from '../resume/docxEdits';
import { listChanges, type Change, type ChangeKind } from './docxChanges';
import { renderDocxPreview } from './docxRender';

/**
 * Word results page: a close in-browser preview of the tailored document (see
 * docxRender.ts) plus an exact list of what changed. The downloaded file is the
 * user's original with only the text replaced. Styled with the popup's tokens.
 */

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface TempDocx {
  original: string;
  reply: string;
  resumeName: string;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bytes: Uint8Array; blob: Blob; fileName: string; changes: Change[]; applied: number; skipped: number };

type View = 'preview' | 'changes';

const KIND: Record<ChangeKind, { label: string; className: string }> = {
  edit: { label: 'Rewritten', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  add: { label: 'Added', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  remove: { label: 'Removed', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  locked: { label: 'Kept, protected line', className: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400' },
};

/** Renders "**bold**" as bold and tab/line-break tokens as spacing. */
function ResumeText({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => {
        const pieces = part.split(/(<tab>|<br>)/).map((piece, j) =>
          piece === TAB ? <span key={j} className="inline-block w-6" /> : piece === BREAK ? <br key={j} /> : <Fragment key={j}>{piece}</Fragment>,
        );
        return i % 2 ? <strong key={i} className="font-semibold">{pieces}</strong> : <Fragment key={i}>{pieces}</Fragment>;
      })}
    </>
  );
}

function Note({ tone, icon, children }: { tone: 'neutral' | 'amber' | 'rose'; icon: ReactNode; children: ReactNode }) {
  const tones = {
    neutral: 'border-zinc-200 bg-white text-zinc-600 dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-400',
    amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
    rose: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
  };
  return (
    <div className={`flex gap-2.5 rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${tones[tone]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

function ChangeRow({ change }: { change: Change }) {
  const kind = KIND[change.kind];
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${kind.className}`}>{kind.label}</span>
        {change.grewBy !== undefined && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            <Warning size={12} weight="bold" />
            {change.grewBy} characters longer, may wrap to an extra line
          </span>
        )}
      </div>
      {change.before !== undefined && (
        <p
          className={`text-[13px] leading-relaxed ${
            change.kind === 'locked'
              ? 'text-zinc-700 dark:text-zinc-300'
              : 'text-zinc-400 line-through decoration-rose-400/60 dark:text-zinc-500'
          }`}
        >
          <ResumeText text={change.before} />
        </p>
      )}
      {change.after !== undefined && (
        <p className="text-[13px] leading-relaxed text-zinc-900 dark:text-zinc-100">
          <ResumeText text={change.after} />
        </p>
      )}
    </li>
  );
}

/** Word pages rendered in the browser, scaled down to fit the column. */
function DocumentPreview({ bytes }: { bytes: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'rendering' | 'done' | 'failed'>('rendering');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    renderDocxPreview(bytes, el)
      .then(() => {
        if (cancelled) return;
        laidOut = true;
        setPhase('done');
        fit();
      })
      .catch((err) => {
        console.error('[ResTail] Word preview failed:', err);
        if (!cancelled) setPhase('failed');
      });

    // Pages are rendered at real size (8.5in); once laid out, shrink them to the available width.
    let laidOut = false;
    function fit() {
      const page = el!.querySelector<HTMLElement>('section.docx');
      if (!page || !laidOut) return;
      const available = el!.clientWidth - 32;
      el!.style.setProperty('--page-zoom', String(Math.min(1, available / page.offsetWidth)));
    }
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [bytes]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200/60 dark:border-white/10 dark:bg-zinc-900">
      {phase === 'rendering' && (
        <p className="absolute inset-x-0 top-24 text-center text-sm text-zinc-500 motion-safe:animate-pulse dark:text-zinc-400">Rendering preview…</p>
      )}
      {phase === 'failed' && (
        <p className="px-4 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
          This document couldn't be previewed here. The download is not affected; open it in Word to check it.
        </p>
      )}
      {/* Hidden (but laid out) while rendering, so the unscaled page never flashes. */}
      <div ref={host} className={`docx-host min-h-[480px] ${phase === 'failed' ? 'hidden' : phase === 'rendering' ? 'invisible' : ''}`} />
    </div>
  );
}

function ViewToggle({ view, onChange, changeCount }: { view: View; onChange: (v: View) => void; changeCount: number }) {
  const item = (v: View, label: string) => (
    <button
      role="tab"
      aria-selected={view === v}
      onClick={() => onChange(v)}
      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
        view === v
          ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50'
          : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div role="tablist" className="flex rounded-lg border border-zinc-200 bg-zinc-200/50 p-0.5 dark:border-white/5 dark:bg-zinc-900">
      {item('preview', 'Preview')}
      {item('changes', `Changes (${changeCount})`)}
    </div>
  );
}

export function DocxResult() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [view, setView] = useState<View>('preview');

  useEffect(() => {
    (async () => {
      const { tempDocx } = (await chrome.storage.local.get('tempDocx')) as { tempDocx?: TempDocx };
      if (!tempDocx) {
        setState({ status: 'error', message: 'No result found. Please run the tailoring again from the ResTail popup.' });
        return;
      }

      const edits = parseDocxEdits(tempDocx.reply);
      const loaded = await loadDocx(base64ToBytes(tempDocx.original));
      const changes = listChanges(collectParagraphs(loaded.doc), edits);
      const { applied, skipped } = applyEdits(loaded.doc, edits);
      const bytes = await saveDocx(loaded);
      const blob = new Blob([bytes as BlobPart], { type: DOCX_MIME });
      chrome.storage.local.remove('tempDocx');

      const fileName = `${tempDocx.resumeName || 'Tailored_Resume'}.docx`;
      document.title = `${fileName} - ResTail`;
      setState({ status: 'ready', bytes, blob, fileName, changes, applied, skipped });
    })().catch((err) => {
      console.error('[ResTail] Word result failed:', err);
      setState({ status: 'error', message: `Could not build the Word document: ${err?.message ?? err}` });
    });
  }, []);

  const download = () => {
    if (state.status !== 'ready') return;
    const url = URL.createObjectURL(state.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ready = state.status === 'ready' ? state : null;
  const longer = ready ? ready.changes.filter((c) => c.grewBy !== undefined).length : 0;
  const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500';

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 transition-colors dark:bg-zinc-950 dark:text-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-zinc-50/85 backdrop-blur dark:border-white/5 dark:bg-zinc-950/85">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 items-center gap-2">
              <MagicWand size={22} weight="fill" />
              <span className="text-lg font-semibold tracking-tight">ResTail</span>
            </div>
            {ready && (
              <>
                <span className="h-4 w-px shrink-0 bg-zinc-300 dark:bg-zinc-700" />
                <span className="truncate text-sm text-zinc-500 dark:text-zinc-400" title={ready.fileName}>
                  {ready.fileName}
                </span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => window.close()}
              className={`rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${focusRing}`}
            >
              Close
            </button>
            <button
              onClick={download}
              disabled={!ready}
              className={`flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition-[background-color,transform] hover:bg-zinc-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white ${focusRing}`}
            >
              <DownloadSimple size={16} weight="bold" />
              Download .docx
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        {state.status === 'loading' && (
          <p className="py-24 text-center text-sm text-zinc-500 motion-safe:animate-pulse dark:text-zinc-400">Applying changes…</p>
        )}

        {state.status === 'error' && (
          <Note tone="rose" icon={<WarningCircle size={16} weight="fill" />}>
            {state.message}
          </Note>
        )}

        {ready && (
          <>
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight">Your tailored resume is ready</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {ready.applied} {ready.applied === 1 ? 'change' : 'changes'} applied
                {ready.skipped > 0 && ` · ${ready.skipped} protected ${ready.skipped === 1 ? 'line' : 'lines'} left as is`}
              </p>
            </div>

            <Note tone="neutral" icon={<Info size={16} weight="bold" />}>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">Your Word formatting is kept.</span> The preview is
              drawn by your browser and can differ slightly from Word; the downloaded file is exact. Need a PDF? Open the download
              in Word or Google Docs and save or download it as PDF.
            </Note>

            {longer > 0 && (
              <Note tone="amber" icon={<Warning size={16} weight="bold" />}>
                {longer} {longer === 1 ? 'line is' : 'lines are'} noticeably longer than before. Check in Word that the resume still
                fits on the same number of pages.
              </Note>
            )}

            <div className="flex">
              <ViewToggle view={view} onChange={setView} changeCount={ready.changes.length} />
            </div>

            {view === 'preview' ? (
              <DocumentPreview bytes={ready.bytes} />
            ) : (
            <section className="flex flex-col gap-2">
              {ready.changes.length > 0 ? (
                <ul className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-zinc-900/50">
                  {ready.changes.map((c, i) => (
                    <ChangeRow key={i} change={c} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-white/15 dark:text-zinc-400">
                  The AI didn't change anything. Try again with a more detailed job description.
                </p>
              )}
            </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
