import { CaretDown, CaretUp, CodeBlock, ArrowCounterClockwise } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'motion/react';

interface CustomInstructionsProps {
  customInstructions: string;
  onChange: (val: string) => void;
  showInstructions: boolean;
  onToggleShow: () => void;
  onReset?: () => void;
}

export function CustomInstructions({ 
  customInstructions, 
  onChange, 
  showInstructions, 
  onToggleShow,
  onReset 
}: CustomInstructionsProps) {
  return (
    <div className="flex flex-col border border-zinc-200 dark:border-white/10 rounded-xl bg-white dark:bg-zinc-900/50 overflow-hidden transition-colors">
      <button 
        type="button"
        onClick={onToggleShow}
        className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
      >
        <span className="text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          <CodeBlock size={16} />
          Custom Instructions
        </span>
        {showInstructions ? <CaretUp size={16} className="text-zinc-500" /> : <CaretDown size={16} className="text-zinc-500" />}
      </button>
      <AnimatePresence>
        {showInstructions && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 pb-3 flex flex-col gap-2"
          >
            <textarea 
              className="w-full h-40 resize-none bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-lg p-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 outline-none focus:border-zinc-400 dark:focus:border-zinc-600 focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 transition-all"
              value={customInstructions}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Enter custom instructions for tailoring your resume..."
            />
            {onReset && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Saved locally
                </span>
                <button
                  type="button"
                  onClick={onReset}
                  className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 font-medium transition-colors cursor-pointer"
                >
                  <ArrowCounterClockwise size={12} />
                  Reset to default
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
