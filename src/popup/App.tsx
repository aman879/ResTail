import { useState, useEffect, useRef } from 'react';
import { DEFAULT_EDITABLE_PROMPT } from '../resume/prompt';
import { needsConversion, normalizeStoredResume, outputOptions, REQUEST_PROTOCOL, resolveOutput, resumeText, type OutputFormat, type Resume } from '../resume/model';
import { Toast } from './components/Toast';
import { Header } from './components/Header';
import { ResumeInput, type InputMode } from './components/ResumeInput';
import { JobDescription } from './components/JobDescription';
import { CustomInstructions } from './components/CustomInstructions';
import { OutputFileName } from './components/OutputFileName';
import { SubmitButton } from './components/SubmitButton';
import { QuickLinks } from './components/QuickLinks';
import { NewFeaturesBanner } from './components/NewFeaturesBanner';
import { clearBadge, dismissBanner, getAnnouncement, openWhatsNew } from '../announce/announcement';

export default function App() {
  const [provider, setProvider] = useState('Gemini');
  const [jobDescription, setJobDescription] = useState('');
  const [customInstructions, setCustomInstructions] = useState(DEFAULT_EDITABLE_PROMPT);
  const [showInstructions, setShowInstructions] = useState(false);
  const [resumeName, setResumeName] = useState('Tailored_Resume');
  /** The user's last choice; the effective format also depends on what the current input supports. */
  const [preferredOutput, setPreferredOutput] = useState<OutputFormat>('pdf');
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [uploadedResume, setUploadedResume] = useState<Resume | null>(null);
  const [pastedLatex, setPastedLatex] = useState('');
  
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [showNewBanner, setShowNewBanner] = useState(false);

  // Update announcement: opening the popup clears the toolbar badge; the banner stays until dismissed.
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.action) return;
    getAnnouncement().then((a) => {
      if (!a) return;
      if (a.badge) clearBadge();
      setShowNewBanner(a.banner);
    });
  }, []);
  const isGeneratingRef = useRef(false);
  /** Prefix for status text while a multi-step run (PDF conversion, then tailoring) is going. */
  const phaseRef = useRef('');

  // Load persistent input data
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['inputMode', 'uploadedResume', 'pastedLatex', 'latexSource', 'resumeName', 'outputFormat', 'customInstructions', 'provider', 'darkMode'], (result) => {
        const uploaded = normalizeStoredResume(result.uploadedResume);
        if (uploaded) setUploadedResume(uploaded);
        if (typeof result.pastedLatex === 'string') {
          setPastedLatex(result.pastedLatex);
        } else if (typeof result.latexSource === 'string') {
          // Migrate from <= 1.2.0, which stored a single latexSource shown in Paste.
          setPastedLatex(result.latexSource);
        }
        if (result.inputMode === 'upload' || result.inputMode === 'paste') {
          setInputMode(result.inputMode);
        } else if (result.latexSource) {
          setInputMode('paste');
        }
        if (result.resumeName) setResumeName(result.resumeName as string);
        if (result.outputFormat === 'pdf' || result.outputFormat === 'tex' || result.outputFormat === 'docx') {
          setPreferredOutput(result.outputFormat);
        }
        if (typeof result.customInstructions === 'string') {
          setCustomInstructions(result.customInstructions as string);
        }
        if (result.provider) setProvider(result.provider as string);
        if (typeof result.darkMode === 'boolean') setIsDarkMode(result.darkMode);
        setIsReady(true);
      });
    } else {
      setIsReady(true);
    }
  }, []);

  // Save persistent input data
  useEffect(() => {
    if (isReady && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      // darkMode is also read by the result pages so they open in the same theme.
      chrome.storage.local.set({ inputMode, uploadedResume, pastedLatex, resumeName, outputFormat: preferredOutput, customInstructions, provider, darkMode: isDarkMode });
      chrome.storage.local.remove('latexSource');
    }
  }, [inputMode, uploadedResume, pastedLatex, resumeName, preferredOutput, customInstructions, provider, isDarkMode, isReady]);

  // The active tab decides the resume; Paste is always LaTeX.
  const activeResume: Resume | null =
    inputMode === 'upload'
      ? uploadedResume
      : pastedLatex.trim()
        ? { origin: 'paste', fileName: '', format: 'latex', source: pastedLatex }
        : null;
  const outputFormat = resolveOutput(activeResume, preferredOutput);

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
        converting_pdf: 'Converting PDF to LaTeX...',
        tailoring: 'Sending prompt to AI...',
        ai_generating: 'AI is typing...',
        extracting_response: 'Reading AI response...',
        compiling_pdf: 'Compiling PDF...',
        checking_latex: 'Checking the .tex compiles...',
      };
      return statusMap[status] || 'Working...';
    };

    const listener = (message: any) => {
      if (message.type === 'STATUS_UPDATE') {
        if (message.status === 'converting_pdf') phaseRef.current = 'Step 1/2 (PDF conversion): ';
        if (message.status === 'tailoring' && phaseRef.current) phaseRef.current = 'Step 2/2 (tailoring): ';
        setStatusText(phaseRef.current + formatStatus(message.status));
      }
      if (message.type === 'RESUME_CONVERTED' && message.resume) {
        // Keep the popup in sync so it doesn't overwrite the saved conversion with stale state.
        setUploadedResume(message.resume as Resume);
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
    if (!activeResume || !resumeText(activeResume).trim()) {
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
      phaseRef.current = '';
      // Delegate the whole flow (PDF conversion if needed, tailoring, compiling) to the service worker.
      chrome.runtime.sendMessage({
        type: 'START_TAILORING',
        protocol: REQUEST_PROTOCOL,
        provider,
        resume: activeResume,
        isSavedUpload: inputMode === 'upload',
        customInstructions,
        jobDescription,
        resumeName,
        outputFormat,
      });

      setToastMsg(
        needsConversion(activeResume)
          ? 'Converting your PDF first (one time only), then tailoring.'
          : 'Tailoring started in a minimized background window.',
      );
      
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

      {showNewBanner && (
        <NewFeaturesBanner
          onOpenWhatsNew={openWhatsNew}
          onDismiss={() => {
            setShowNewBanner(false);
            dismissBanner();
          }}
        />
      )}

      {isReady && (
        <ResumeInput 
          inputMode={inputMode}
          onInputModeChange={setInputMode}
          uploaded={uploadedResume}
          onUploaded={setUploadedResume}
          pastedLatex={pastedLatex}
          onPastedLatexChange={setPastedLatex}
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
        onReset={() => {
          setCustomInstructions(DEFAULT_EDITABLE_PROMPT);
          setToastMsg('Custom instructions reset to default.');
        }}
      />

      <OutputFileName 
        resumeName={resumeName}
        outputFormat={outputFormat}
        outputOptions={outputOptions(activeResume)}
        onOutputFormatChange={setPreferredOutput}
        onChange={setResumeName} 
      />

      <SubmitButton 
        isGenerating={isGenerating} 
        onClick={handleTailor}
        statusText={statusText}
      />

      <QuickLinks latex={resumeText(activeResume)} />

      <footer className="mt-2 flex flex-col items-center justify-center gap-1 border-t border-zinc-200/50 dark:border-white/5 pt-4 text-center">
        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-2.5 leading-relaxed text-left w-full px-1">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 block mb-0.5">Enjoying ResTail?</span>
          If it saved you time or helped you land an interview, consider supporting the project ☕
          <span className="block mt-1">
            ResTail is open source. Found a bug or have an idea? Feel free to{' '}
            <a href="https://github.com/aman879/ResTail" target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-700 dark:text-zinc-300 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">contribute on GitHub</a>.
          </span>
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          <a href="https://aman879.github.io/ResTail-policies/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">Privacy</a>
          <span>.</span>
          <a href="https://aman879.github.io/ResTail-policies/term.html" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">Terms</a>
          <span>.</span>
          <a href="https://aman879.github.io/ResTail-policies/about.html" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">About</a>
          <span>.</span>
          <a href="https://github.com/aman879/ResTail" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">GitHub</a>
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
