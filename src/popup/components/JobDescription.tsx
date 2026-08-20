interface JobDescriptionProps {
  jobDescription: string;
  onChange: (val: string) => void;
}

export function JobDescription({ jobDescription, onChange }: JobDescriptionProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Job Description</label>
      <textarea 
        placeholder="Paste the job description here..."
        className="w-full h-32 resize-none bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-xl p-3 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
        value={jobDescription}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
