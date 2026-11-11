import React, { useState, useRef } from 'react';
import { UploadSimple, FileText, Info } from '@phosphor-icons/react';
import { parseLatexFile } from '../../resume/parser';
import type { Resume } from '../../resume/model';

export type InputMode = 'upload' | 'paste';

interface ResumeInputProps {
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  uploaded: Resume | null;
  onUploaded: (resume: Resume) => void;
  pastedLatex: string;
  onPastedLatexChange: (latex: string) => void;
  onError: (msg: string) => void;
}

/**
 * Upload and Paste each keep their own saved content; the parent uses
 * whichever tab is active as the resume source.
 */
export function ResumeInput({
  inputMode,
  onInputModeChange,
  uploaded,
  onUploaded,
  pastedLatex,
  onPastedLatexChange,
  onError,
}: ResumeInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    const name = file.name.toLowerCase();
    const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';
    const isDocx = name.endsWith('.docx');
    if (name.endsWith('.doc')) {
      onError('Old .doc files are not supported. Open it in Word and save it as .docx.');
      return;
    }
    if (!isPdf && !isDocx && !name.endsWith('.tex')) {
      onError('Please upload a .tex, .docx or .pdf file.');
      return;
    }

    setIsParsing(true);
    try {
      if (isPdf) {
        // Lazy-load pdf.js so it only costs anything when a PDF is actually used.
        const { extractPdfText } = await import('../../resume/pdf');
        const text = await extractPdfText(file);
        // Converted to LaTeX on the first tailoring; a new upload always starts a fresh conversion.
        onUploaded({ origin: 'pdf', fileName: file.name, format: 'latex', source: '', pdfExtract: text });
        // Paste is LaTeX-only; a PDF replaces any pasted LaTeX.
        onPastedLatexChange('');
      } else if (isDocx) {
        const { loadDocx, collectParagraphs, buildOutline, bytesToBase64 } = await import('../../resume/docx');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { doc } = await loadDocx(bytes);
        const paragraphs = collectParagraphs(doc);
        if (paragraphs.filter((p) => !p.locked).length === 0) {
          throw new Error('No editable text found in this Word document.');
        }
        onUploaded({
          origin: 'docx',
          fileName: file.name,
          format: 'docx',
          source: bytesToBase64(bytes),
          docxOutline: buildOutline(paragraphs),
        });
        onPastedLatexChange('');
      } else {
        const content = await parseLatexFile(file);
        onUploaded({ origin: 'tex', fileName: file.name, format: 'latex', source: content });
      }
    } catch (err: any) {
      onError(err.message || 'Error reading file.');
    } finally {
      setIsParsing(false);
    }
  };

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onPastedLatexChange(e.target.value);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Resume (.tex, .docx or .pdf)</label>
        <div className="flex bg-zinc-200/50 dark:bg-zinc-900 rounded-lg p-0.5 border border-zinc-200 dark:border-white/5 transition-colors">
          <button 
            onClick={() => onInputModeChange('upload')}
            className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${inputMode === 'upload' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}
          >
            Upload
          </button>
          <button 
            onClick={() => onInputModeChange('paste')}
            className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${inputMode === 'paste' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}
          >
            Paste
          </button>
        </div>
      </div>

      {inputMode === 'upload' ? (
        <div 
          className={`relative border-2 dark:border border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer 
            ${isDragging 
              ? 'border-zinc-950 bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-900' 
              : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100/50 dark:border-white/20 dark:hover:border-white/30 dark:hover:bg-zinc-900/50'}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".tex,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
            className="hidden" 
          />
          {isParsing ? (
            <>
              <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-500 dark:text-zinc-400 dark:border dark:border-white/5">
                <FileText size={20} weight="duotone" className="animate-pulse" />
              </div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-300">Reading file...</p>
            </>
          ) : uploaded ? (
            <>
              <div className="w-10 h-10 rounded-full bg-zinc-950 dark:bg-zinc-800 flex items-center justify-center text-white dark:border dark:border-white/10">
                <FileText size={20} weight="duotone" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-950 dark:text-zinc-100">{uploaded.fileName}</p>
                <p className="text-xs text-zinc-500 mt-0.5">Click or drag to replace</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-500 dark:text-zinc-400 dark:border dark:border-white/5">
                <UploadSimple size={20} weight="regular" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-300">Upload Resume</p>
                <p className="text-xs text-zinc-500 mt-0.5">.tex, .docx or .pdf · drag & drop or click</p>
              </div>
            </>
          )}
        </div>
      ) : (
        <textarea 
          placeholder="Paste your raw LaTeX code here..."
          className="w-full h-32 resize-none bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-900 dark:text-zinc-300 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          value={pastedLatex}
          onChange={handlePasteChange}
        />
      )}

      {inputMode === 'upload' && uploaded?.origin === 'docx' && !isParsing && (
        <div className="flex gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[11px] leading-snug text-zinc-600 dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-400">
          <Info size={14} weight="bold" className="mt-px shrink-0" />
          <p>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">Your Word formatting is kept.</span> Only
            the text is rewritten, and you get a <span className="font-mono">.docx</span> back. Need a PDF? Open it in
            Word or Google Docs and save or download it as PDF.
          </p>
        </div>
      )}

      {inputMode === 'upload' && uploaded?.origin === 'pdf' && !isParsing && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
          <Info size={14} weight="bold" className="mt-px shrink-0" />
          <p>
            <span className="font-semibold">Layout may look different.</span> A PDF only gives us its text, so the AI
            rebuilds the design. Your content stays the same, but fonts, spacing or columns can change. For the exact
            same look, upload your <span className="font-mono">.tex</span> file.
            <span className="mt-1 block">
              {uploaded.source
                ? 'Already rebuilt: every tailoring now uses the same layout. Upload the PDF again to rebuild it.'
                : 'The first tailoring rebuilds it once (takes a bit longer), then reuses it so the layout stays the same.'}
            </span>
          </p>
        </div>
      )}

      <span className="text-[10px] text-zinc-500 dark:text-zinc-500 text-center leading-normal mt-1">
        By uploading or pasting your resume, you agree to the{' '}
        <a href="https://aman879.github.io/ResTail-policies/privacy.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-800 dark:hover:text-zinc-300">Privacy Policy</a>
        {' '}and{' '}
        <a href="https://aman879.github.io/ResTail-policies/term.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-800 dark:hover:text-zinc-300">Terms of Service</a>.
      </span>
    </div>
  );
}
