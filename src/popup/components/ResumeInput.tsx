import React, { useState, useRef } from 'react';
import { UploadSimple, FileText } from '@phosphor-icons/react';
import { parseLatexFile } from '../../resume/parser';

type InputMode = 'upload' | 'paste';

interface ResumeInputProps {
  initialLatex?: string;
  onLatexLoaded: (latex: string) => void;
  onError: (msg: string) => void;
}

export function ResumeInput({ initialLatex = '', onLatexLoaded, onError }: ResumeInputProps) {
  const [inputMode, setInputMode] = useState<InputMode>(initialLatex ? 'paste' : 'upload');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [pastedLatex, setPastedLatex] = useState(initialLatex);
  
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
    if (!file.name.endsWith('.tex')) {
      onError('Please upload a valid .tex file.');
      return;
    }
    
    try {
      const content = await parseLatexFile(file);
      setUploadedFile(file);
      onLatexLoaded(content);
      console.log('--- UPLOADED RESUME (.tex) ---');
      console.log(content.substring(0, 100) + '...');
    } catch (err: any) {
      onError(err.message || 'Error reading file.');
    }
  };

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPastedLatex(val);
    onLatexLoaded(val);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Resume (.tex)</label>
        <div className="flex bg-zinc-200/50 dark:bg-zinc-900 rounded-lg p-0.5 border border-zinc-200 dark:border-white/5 transition-colors">
          <button 
            onClick={() => {
              setInputMode('upload');
              // Clear state on switch if desired, or let parent handle the source
            }}
            className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${inputMode === 'upload' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}
          >
            Upload
          </button>
          <button 
            onClick={() => {
              setInputMode('paste');
              onLatexLoaded(pastedLatex);
            }}
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
            accept=".tex" 
            className="hidden" 
          />
          {uploadedFile ? (
            <>
              <div className="w-10 h-10 rounded-full bg-zinc-950 dark:bg-zinc-800 flex items-center justify-center text-white dark:border dark:border-white/10">
                <FileText size={20} weight="duotone" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-950 dark:text-zinc-100">{uploadedFile.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">Click or drag to replace</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-500 dark:text-zinc-400 dark:border dark:border-white/5">
                <UploadSimple size={20} weight="regular" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-300">Upload LaTeX Resume</p>
                <p className="text-xs text-zinc-500 mt-0.5">Drag & drop or click to browse</p>
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

      <span className="text-[10px] text-zinc-500 dark:text-zinc-500 text-center leading-normal mt-1">
        By uploading or pasting your resume, you agree to the{' '}
        <a href="privacy.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-800 dark:hover:text-zinc-300">Privacy Policy</a>
        {' '}and{' '}
        <a href="term.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-800 dark:hover:text-zinc-300">Terms of Service</a>.
      </span>
    </div>
  );
}
