import { MagicWand, Sun, Moon, CaretDown } from '@phosphor-icons/react';

interface HeaderProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  provider: string;
  onProviderChange: (provider: string) => void;
}

export function Header({ isDarkMode, onToggleDarkMode, provider, onProviderChange }: HeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <MagicWand size={24} weight="fill" className="text-zinc-950 dark:text-zinc-50" />
        <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-white">ResTail</h1>
      </div>
      
      <div className="flex items-center gap-3">
        <button 
          onClick={onToggleDarkMode}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title="Toggle theme"
        >
          {isDarkMode ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
        </button>

        <div className="relative">
          <select 
            className="appearance-none bg-zinc-200/50 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors pl-3 pr-8 py-1.5 rounded-md text-sm font-medium outline-none cursor-pointer border border-zinc-200 dark:border-white/10 text-zinc-950 dark:text-zinc-50"
            value={provider}
            onChange={(e) => onProviderChange(e.target.value)}
          >
            <option value="Gemini">Gemini</option>
            <option value="ChatGPT" disabled>ChatGPT (Coming Soon)</option>
            <option value="Claude" disabled>Claude (Coming Soon)</option>
          </select>
          <CaretDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500 dark:text-zinc-400" />
        </div>
      </div>
    </div>
  );
}
