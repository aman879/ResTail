interface OutputFileNameProps {
  resumeName: string;
  onChange: (val: string) => void;
}

export function OutputFileName({ resumeName, onChange }: OutputFileNameProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Output File Name</label>
      <div className="flex items-center bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-xl overflow-hidden focus-within:border-zinc-400 dark:focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-400 dark:focus-within:ring-zinc-500 transition-all">
        <input 
          type="text"
          placeholder="Tailored_Resume"
          className="flex-1 bg-transparent p-3 text-sm text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          value={resumeName}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="pr-4 text-sm text-zinc-500 dark:text-zinc-400 font-medium select-none">
          .pdf
        </span>
      </div>
    </div>
  );
}
