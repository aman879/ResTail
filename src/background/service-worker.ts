import { extractLatex, validateLatex } from '../resume/latex';

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_TAILORING') {
    handleTailoring(message.provider, message.prompt, message.resumeName);
    sendResponse({ started: true });
  }
  return false;
});

/**
 * Orchestrates the AI tailoring process by opening the provider in a new window,
 * injecting the prompt, and handling the LaTeX compilation to PDF.
 *
 * @param provider - The name of the AI provider (e.g., 'Gemini', 'ChatGPT', 'Claude')
 * @param prompt - The formatted prompt containing instructions, JD, and Resume
 * @param resumeName - The original name of the resume file for saving the generated PDF
 */
async function handleTailoring(provider: string, prompt: string, resumeName: string) {
  const url = PROVIDER_URLS[provider];
  const scriptFile = PROVIDER_SCRIPTS[provider];

  if (!url || !scriptFile) {
    chrome.runtime.sendMessage({ type: 'TAILORING_FAILED', error: `Unknown provider: ${provider}` }).catch(() => {});
    return;
  }

  let tabId: number | undefined;
  let winId: number | undefined;

  try {
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

    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'sending_prompt' }).catch(() => {});
    const response = await sendMessageWithRetries(tabId, { type: 'SEND_PROMPT', prompt }, 5);

    if (response && response.error) {
      throw new Error(response.error);
    }

    if (!response || !response.text) {
      throw new Error('No response returned from the AI.');
    }

    const extracted = extractLatex(response.text);
    
    if (!validateLatex(extracted)) {
      throw new Error('The AI response did not contain valid LaTeX code.');
    }

    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'compiling_pdf' }).catch(() => {});
    const pdfResponse = await fetch('https://latex.ytotech.com/builds/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compiler: 'pdflatex',
        resources: [{ main: true, content: extracted }]
      })
    });

    if (!pdfResponse.ok) {
      throw new Error('PDF compilation failed. The LaTeX template might be too complex.');
    }

    const arrayBuffer = await pdfResponse.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);

    await chrome.storage.local.set({
      tempPdfBase64: base64,
      tempResumeName: resumeName
    });

    if (winId) {
      try {
        await chrome.windows.remove(winId);
      } catch (e) {
        // Ignore if already closed
      }
    }

    await chrome.tabs.create({
      url: chrome.runtime.getURL('preview.html')
    });

    // Notify the popup that we are done
    chrome.runtime.sendMessage({ type: 'TAILORING_COMPLETE' }).catch(() => {});

  } catch (err: any) {
    console.error('[ResTail] Orchestration failed:', err);
    chrome.runtime.sendMessage({ type: 'TAILORING_FAILED', error: err.message || 'An error occurred.' }).catch(() => {});
  }
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
