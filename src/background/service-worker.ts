import { extractLatex, validateLatex } from '../resume/latex';
import { restoreBadge, startAnnouncement } from '../announce/announcement';
import { needsConversion, normalizeStoredResume, REQUEST_PROTOCOL, resolveOutput, type OutputFormat, type Resume } from '../resume/model';
import { buildConvertPrompt, buildDocxTailorPrompt, buildTailorPrompt } from '../resume/prompt';
import { countEdits, parseDocxEdits } from '../resume/docxEdits';
import type { ResponseKind } from '../resume/response';

interface TailorRequest {
  provider: string;
  resume: Resume;
  /** Whether `resume` is the saved upload (so a PDF conversion can be stored back). */
  isSavedUpload: boolean;
  customInstructions: string;
  jobDescription: string;
  resumeName: string;
  outputFormat: OutputFormat;
}

const PROVIDER_URLS: Record<string, string> = {
  Gemini: 'https://gemini.google.com/',
  ChatGPT: 'https://chatgpt.com/',
  Claude: 'https://claude.ai/new'
};

const PROVIDER_SCRIPTS: Record<string, string> = {
  Gemini: 'assets/content_gemini.js',
  ChatGPT: 'assets/content_chatgpt.js',
  Claude: 'assets/content_claude.js'
};

chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  if (reason === chrome.runtime.OnInstalledReason.UPDATE) startAnnouncement(previousVersion).catch(console.error);
});
chrome.runtime.onStartup.addListener(() => {
  restoreBadge().catch(console.error);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_TAILORING') {
    if (message.protocol !== REQUEST_PROTOCOL) {
      chrome.runtime
        .sendMessage({
          type: 'TAILORING_FAILED',
          error: 'ResTail was updated. Reload the extension (chrome://extensions → ↻) and try again.',
        })
        .catch(() => {});
      sendResponse({ started: false });
      return false;
    }
    handleTailoring(message as TailorRequest);
    sendResponse({ started: true });
  }
  return false;
});

const status = (s: string) => chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: s }).catch(() => {});

/** Sends one prompt to the provider tab and returns the raw reply text. */
async function runPrompt(tabId: number, prompt: string, expect: ResponseKind): Promise<string> {
  status('sending_prompt');
  const response = await sendMessageWithRetries(tabId, { type: 'SEND_PROMPT', prompt, expect }, 5);
  if (response && response.error) throw new Error(response.error);
  if (!response || !response.text) throw new Error('No response returned from the AI.');
  return response.text as string;
}

/** Sends one prompt to the provider tab and returns the LaTeX document from its reply. */
async function runLatexPrompt(tabId: number, prompt: string): Promise<string> {
  const latex = extractLatex(await runPrompt(tabId, prompt, 'latex'));
  if (!validateLatex(latex)) throw new Error('The AI response did not contain valid LaTeX code.');
  return latex;
}

async function compileLatex(latex: string): Promise<ArrayBuffer | null> {
  const res = await fetch('https://latex.ytotech.com/builds/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ compiler: 'pdflatex', resources: [{ main: true, content: latex }] }),
  });
  return res.ok ? res.arrayBuffer() : null;
}

/**
 * Converts a PDF upload to LaTeX once and saves it as the resume's source,
 * so every later tailoring starts from the same LaTeX and keeps the same layout.
 */
async function convertPdfResume(tabId: number, resume: Resume, isSavedUpload: boolean): Promise<Resume> {
  status('converting_pdf');
  const latex = await runLatexPrompt(tabId, buildConvertPrompt(resume.pdfExtract ?? ''));
  if (!(await compileLatex(latex))) {
    throw new Error('Converting the PDF failed: the generated LaTeX did not compile. Please try again.');
  }

  const converted: Resume = { ...resume, source: latex, pdfExtract: undefined };
  if (isSavedUpload) {
    // Only store it if the user hasn't uploaded a different file in the meantime.
    const stored = normalizeStoredResume((await chrome.storage.local.get('uploadedResume')).uploadedResume);
    if (stored && stored.origin === 'pdf' && stored.pdfExtract === resume.pdfExtract) {
      await chrome.storage.local.set({ uploadedResume: converted });
      chrome.runtime.sendMessage({ type: 'RESUME_CONVERTED', resume: converted }).catch(() => {});
    }
  }
  return converted;
}

/**
 * Orchestrates the AI tailoring process by opening the provider in a new window,
 * converting a PDF upload to LaTeX first if needed, tailoring, and compiling to PDF.
 */
async function handleTailoring({ provider, resume, isSavedUpload, customInstructions, jobDescription, resumeName, outputFormat }: TailorRequest) {
  // Never trust the popup blindly: fall back to an output this input can actually produce.
  const output = resolveOutput(resume, outputFormat);
  const url = PROVIDER_URLS[provider];
  const scriptFile = PROVIDER_SCRIPTS[provider];

  if (!url || !scriptFile) {
    chrome.runtime.sendMessage({ type: 'TAILORING_FAILED', error: `Unknown provider: ${provider}` }).catch(() => {});
    return;
  }

  let tabId: number | undefined;
  let winId: number | undefined;
  let userWinId: number | undefined;

  try {
    try {
      const userWin = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
      userWinId = userWin?.id;
    } catch (e) {
      // Ignore if unable to fetch last focused window
    }

    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'opening_tab' }).catch(() => {});

    const win = await chrome.windows.create({
      url,
      type: 'normal',
      focused: true,
      width: 800,
      height: 600
    });

    tabId = win?.tabs?.[0]?.id;
    winId = win?.id;
    if (!tabId || !winId) {
      throw new Error('Failed to open AI automation window.');
    }

    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'loading_page' }).catch(() => {});
    await waitForTabLoad(tabId);
    await sleep(3000);

    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'injecting_script' }).catch(() => {});
    await sleep(500);

    if (resume.format === 'docx') {
      // Word: the AI only returns paragraph edits; the preview page (which has an XML DOM) applies them.
      status('tailoring');
      const reply = await runPrompt(tabId, buildDocxTailorPrompt(resume.docxOutline ?? '', customInstructions, jobDescription), 'docx-edits');
      if (countEdits(parseDocxEdits(reply)) === 0) {
        throw new Error('The AI response did not contain any resume changes. Please try again.');
      }
      await chrome.storage.local.set({ tempDocx: { original: resume.source, reply, resumeName } });
      await closeWindowAndOpen(winId, userWinId, 'preview-docx.html');
      chrome.runtime.sendMessage({ type: 'TAILORING_COMPLETE' }).catch(() => {});
      return;
    }

    let source = resume;
    if (needsConversion(resume)) {
      source = await convertPdfResume(tabId, resume, isSavedUpload);
      // Tailor in a fresh chat so the conversion doesn't leak into the context.
      status('loading_page');
      await chrome.tabs.update(tabId, { url });
      await waitForTabLoad(tabId);
      await sleep(3000);
    }

    status('tailoring');
    const extracted = await runLatexPrompt(tabId, buildTailorPrompt(source.source, customInstructions, jobDescription, output === 'tex' ? 'tex' : 'pdf'));

    status(output === 'tex' ? 'checking_latex' : 'compiling_pdf');
    const arrayBuffer = await compileLatex(extracted);
    if (!arrayBuffer) {
      throw new Error('PDF compilation failed. The LaTeX template might be too complex.');
    }

    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);

    // The PDF is always compiled: it proves the .tex works and powers the preview.
    await chrome.storage.local.set({
      tempPdfBase64: base64,
      tempResumeName: resumeName,
      tempOutputFormat: output,
      tempLatex: output === 'tex' ? extracted : null,
    });

    await closeWindowAndOpen(winId, userWinId, 'preview.html');

    // Notify the popup that we are done
    chrome.runtime.sendMessage({ type: 'TAILORING_COMPLETE' }).catch(() => {});

  } catch (err: any) {
    console.error('[ResTail] Orchestration failed:', err);
    chrome.runtime.sendMessage({ type: 'TAILORING_FAILED', error: err.message || 'An error occurred.' }).catch(() => {});
  }
}

/** Closes the AI window and opens an extension page in the user's window. */
async function closeWindowAndOpen(winId: number | undefined, userWinId: number | undefined, page: string) {
  if (winId) {
    try {
      await chrome.windows.remove(winId);
    } catch {
      // Ignore if already closed
    }
  }

  const url = chrome.runtime.getURL(page);
  if (userWinId) {
    try {
      await chrome.tabs.create({ windowId: userWinId, url, active: true });
      await chrome.windows.update(userWinId, { focused: true });
      return;
    } catch {
      // Fall through if userWinId is no longer valid
    }
  }
  await chrome.tabs.create({ url });
}

/**
 * Waits for a specific tab to finish loading.
 * Includes a safety timeout of 30 seconds to prevent hanging.
 *
 * @param tabId - The ID of the tab to monitor
 * @returns A promise that resolves when the tab load is complete or the timeout is reached
 */
function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (updatedTabId: number, info: any) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    
    // Safety timeout
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

/**
 * Sends a message to a content script with retry logic.
 * Useful for ensuring the content script is ready to receive messages immediately after page load.
 *
 * @param tabId - The ID of the tab to send the message to
 * @param message - The payload to send
 * @param retries - Number of retry attempts
 * @returns A promise resolving to the response from the content script
 */
async function sendMessageWithRetries(tabId: number, message: any, retries: number): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      return await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      });
    } catch (err: any) {
      if (i === retries - 1) throw err;
      await sleep(1500);
    }
  }
}

/**
 * Utility function to sleep for a specified number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
