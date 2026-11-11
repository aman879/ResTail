import { CaretDown } from '@phosphor-icons/react';
import type { OutputFormat, OutputOption } from '../../resume/model';

interface OutputFileNameProps {
  resumeName: string;
  onChange: (val: string) => void;
  outputFormat: OutputFormat;
  outputOptions: OutputOption[];
  onOutputFormatChange: (format: OutputFormat) => void;
}

export function OutputFileName({ resumeName, onChange, outputFormat, outputOptions, onOutputFormatChange }: OutputFileNameProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Output File</label>
      <div className="flex items-center bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-xl overflow-hidden focus-within:border-zinc-400 dark:focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-400 dark:focus-within:ring-zinc-500 transition-all">
        <input 
          type="text"
          placeholder="Tailored_Resume"
          aria-label="Output file name"
          className="flex-1 min-w-0 bg-transparent p-3 text-sm text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          value={resumeName}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="relative shrink-0 border-l border-zinc-200 dark:border-white/10">
          <select
            aria-label="Output format"
            className="w-[88px] appearance-none bg-transparent py-3 pl-3 pr-8 text-sm font-medium text-zinc-700 dark:text-zinc-300 outline-none cursor-pointer"
            value={outputFormat}
            onChange={(e) => onOutputFormatChange(e.target.value as OutputFormat)}
          >
            {outputOptions.map((o) => (
              <option key={o.format} value={o.format} disabled={!o.enabled} className="text-zinc-900">
                .{o.format}{o.reason ? ` (${o.reason})` : ''}
              </option>
            ))}
          </select>
          <CaretDown size={12} weight="bold" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>
      </div>
    </div>
  );
}
