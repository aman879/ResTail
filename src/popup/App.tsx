import { useState, useEffect, useRef } from 'react';
import { DEFAULT_EDITABLE_PROMPT, LOCKED_PROMPT } from '../resume/prompt';
import { Toast } from './components/Toast';
import { Header } from './components/Header';
import { ResumeInput } from './components/ResumeInput';
import { JobDescription } from './components/JobDescription';
import { CustomInstructions } from './components/CustomInstructions';
import { OutputFileName } from './components/OutputFileName';
import { SubmitButton } from './components/SubmitButton';

export default function App() {
  const [provider, setProvider] = useState('Gemini');
  const [jobDescription, setJobDescription] = useState('');
  const [customInstructions, setCustomInstructions] = useState(DEFAULT_EDITABLE_PROMPT);
  const [showInstructions, setShowInstructions] = useState(false);
  const [resumeName, setResumeName] = useState('Tailored_Resume');
  const [latexSource, setLatexSource] = useState('');
  
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [isReady, setIsReady] = useState(false);
  const isGeneratingRef = useRef(false);

  // Load persistent input data
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['latexSource', 'resumeName'], (result) => {
        if (result.latexSource) setLatexSource(result.latexSource as string);
        if (result.resumeName) setResumeName(result.resumeName as string);
        setIsReady(true);
      });
    } else {
      setIsReady(true);
    }
  }, []);

  // Save persistent input data
  useEffect(() => {
    if (isReady && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ latexSource, resumeName });
    }
  }, [latexSource, resumeName, isReady]);

  // Apply dark mode class to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Listen for live status updates and completion from background worker
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
    
    const formatStatus = (status: string): string => {
      const statusMap: Record<string, string> = {
        opening_tab: 'Opening AI window...',
        loading_page: 'Waiting for page to load...',
        injecting_script: 'Preparing...',
        sending_prompt: 'Sending prompt to AI...',
        ai_generating: 'AI is typing...',
        extracting_response: 'Reading AI response...',
        compiling_pdf: 'Compiling PDF...',
      };
      return statusMap[status] || 'Working...';
    };

    const listener = (message: any) => {
      if (message.type === 'STATUS_UPDATE') {
        setStatusText(formatStatus(message.status));
      }
      if (message.type === 'TAILORING_COMPLETE') {
        setIsGenerating(false);
        isGeneratingRef.current = false;
        setStatusText('');
        setToastMsg('Success! Opening preview...');
      }
      if (message.type === 'TAILORING_FAILED') {
        setIsGenerating(false);
        isGeneratingRef.current = false;
        setStatusText('');
        setToastMsg(message.error || 'Tailoring failed.');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  const handleTailor = async () => {
    if (isGeneratingRef.current) return;
    if (!latexSource) {
      setToastMsg('Please provide a resume first.');
      return;
    }
    if (!jobDescription.trim()) {
      setToastMsg('Please enter a job description.');
      return;
    }
    if (!resumeName.trim()) {
      setToastMsg('Please provide an output file name.');
      return;
    }
    
    isGeneratingRef.current = true;
    setIsGenerating(true);
    setStatusText('Starting...');
    
    try {
      const fullPrompt = `${LOCKED_PROMPT}\n\nUSER'S CUSTOM PROMPT:\n${customInstructions}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nORIGINAL RESUME:\n${latexSource}`;
      
      // Delegate tailoring process to service worker
      chrome.runtime.sendMessage({
        type: 'START_TAILORING',
        provider,
        prompt: fullPrompt,
        resumeName
      });

      setToastMsg('Tailoring started in a minimized background window.');
      
    } catch (error: any) {
      setToastMsg(error.message || 'An error occurred.');
      console.error(error);
      isGeneratingRef.current = false;
      setIsGenerating(false);
      setStatusText('');
    }
  };

  return (
    <div className="w-[420px] bg-zinc-50 dark:bg-zinc-950 p-6 flex flex-col gap-6 text-zinc-950 dark:text-zinc-50 border-transparent dark:border-white/5 dark:shadow-2xl transition-colors duration-200 relative overflow-hidden">
      
      <Toast message={toastMsg} />

      <Header 
        isDarkMode={isDarkMode} 
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} 
        provider={provider} 
        onProviderChange={setProvider} 
      />

      {isReady && (
        <ResumeInput 
          initialLatex={latexSource}
          onLatexLoaded={setLatexSource} 
          onError={setToastMsg} 
        />
      )}

      <JobDescription 
        jobDescription={jobDescription} 
        onChange={setJobDescription} 
      />

      <CustomInstructions 
        customInstructions={customInstructions} 
        onChange={setCustomInstructions} 
        showInstructions={showInstructions} 
        onToggleShow={() => setShowInstructions(!showInstructions)} 
      />

      <OutputFileName 
        resumeName={resumeName} 
        onChange={setResumeName} 
      />

      <SubmitButton 
        isGenerating={isGenerating} 
        onClick={handleTailor}
        statusText={statusText}
      />

      <footer className="mt-2 flex flex-col items-center justify-center gap-1 border-t border-zinc-200/50 dark:border-white/5 pt-4 text-center">
        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-2.5 leading-relaxed text-left w-full px-1">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 block mb-0.5">Enjoying ResTail?</span>
          If it saved you time or helped you land an interview, consider supporting the project ☕
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          <a href="privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">Privacy</a>
          <span>.</span>
          <a href="term.html" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">Terms</a>
          <span>.</span>
          <a href="about.html" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">About</a>
          <span>.</span>
          <a href="https://ko-fi.com/sch1zo" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors flex items-center gap-0.5 text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300">
            Support ❤️
          </a>
        </div>
        <span className="text-[9px] text-zinc-400 dark:text-zinc-600 mt-0.5">&copy; 2026 ResTail. Local-first.</span>
      </footer>
    </div>
  );
}
