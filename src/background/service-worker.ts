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

async function handleTailoring(provider: string, prompt: string, resumeName: string) {
  const url = PROVIDER_URLS[provider];
  const scriptFile = PROVIDER_SCRIPTS[provider];

  if (!url || !scriptFile) {
    chrome.runtime.sendMessage({ type: 'TAILORING_FAILED', error: `Unknown provider: ${provider}` }).catch(() => {});
    return;
  }

  let winId: number | undefined;

  try {
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'opening_tab' }).catch(() => {});

    // 1. Open a new window as minimized and unfocused (keeps the popup open!)
    const win = await chrome.windows.create({
      url,
      type: 'popup',
      state: 'minimized',
      focused: false
    });

    const tabId = win?.tabs?.[0]?.id;
    winId = win?.id;
    if (!tabId || !winId) {
      throw new Error('Failed to open AI automation window.');
    }

    // 2. Wait for the tab to load
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'loading_page' }).catch(() => {});
    await waitForTabLoad(tabId);
    await sleep(3000);

    // 3. Inject the content script
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'injecting_script' }).catch(() => {});
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [scriptFile]
    });

    await sleep(500);

    // 4. Send prompt to the script (retrying if the script takes a moment to bind)
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'sending_prompt' }).catch(() => {});
    const response = await sendMessageWithRetries(tabId, { type: 'SEND_PROMPT', prompt }, 5);

    if (response && response.error) {
      throw new Error(response.error);
    }

    if (!response || !response.text) {
      throw new Error('No response returned from the AI.');
    }

    console.log('====== RAW AI RESPONSE ======');
    console.log(response.text);
    console.log('=============================');
    
    const extracted = extractLatex(response.text);
    console.log('====== EXTRACTED LATEX ======');
    console.log(extracted);
    console.log('=============================');
    
    if (!validateLatex(extracted)) {
      throw new Error('The AI response did not contain valid LaTeX code.');
    }

    // 5. Compile LaTeX to PDF
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

    // 6. Save PDF to storage & open preview.html tab
    await chrome.storage.local.set({
      tempPdfBase64: base64,
      tempResumeName: resumeName
    });

    await chrome.tabs.create({
      url: chrome.runtime.getURL('preview.html')
    });

    // Notify the popup that we are done
    chrome.runtime.sendMessage({ type: 'TAILORING_COMPLETE' }).catch(() => {});

  } catch (err: any) {
    console.error('[ResTail] Orchestration failed:', err);
    chrome.runtime.sendMessage({ type: 'TAILORING_FAILED', error: err.message || 'An error occurred.' }).catch(() => {});
  } finally {
    // 7. Close the popup window
    if (winId) {
      chrome.windows.remove(winId).catch(() => {});
    }
  }
}

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



function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
