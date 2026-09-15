import { motion, AnimatePresence } from 'motion/react';
import { WarningCircle, CheckCircle, Info } from '@phosphor-icons/react';

interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  const getToastDetails = (msg: string) => {
    const lower = msg.toLowerCase();
    const isSuccess = lower.includes('success') || lower.includes('complete') || lower.includes('download') || lower.includes('started');
    const isError = lower.includes('error') || lower.includes('fail') || lower.includes('please') || lower.includes('provide');
    
    if (isSuccess) {
      return {
        icon: <CheckCircle size={18} weight="fill" className="text-emerald-500" />,
        borderColor: "border-emerald-500/20"
      };
    }
    if (isError) {
      return {
        icon: <WarningCircle size={18} weight="fill" className="text-rose-500" />,
        borderColor: "border-rose-500/20"
      };
    }
    return {
      icon: <Info size={18} weight="fill" className="text-sky-500" />,
      borderColor: "border-sky-500/20"
    };
  };

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-zinc-900/95 dark:bg-zinc-950/95 text-white dark:text-zinc-50 px-4 py-2.5 rounded-2xl shadow-2xl text-sm font-medium border ${getToastDetails(message).borderColor} backdrop-blur-md max-w-[90%]`}
        >
          {getToastDetails(message).icon}
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
