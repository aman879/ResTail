import { MagicWand } from '@phosphor-icons/react';

interface SubmitButtonProps {
  isGenerating: boolean;
  onClick: () => void;
  statusText?: string;
}

export function SubmitButton({ isGenerating, onClick, statusText }: SubmitButtonProps) {
  return (
    <button 
      onClick={onClick}
      disabled={isGenerating}
      className={`w-full font-medium text-sm py-3 rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm ${isGenerating ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-500' : 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white'}`}
    >
      <MagicWand size={18} weight={isGenerating ? "regular" : "bold"} className={isGenerating ? "animate-pulse" : ""} />
      {isGenerating ? (statusText || 'Generating...') : 'Tailor Resume'}
    </button>
  );
}
