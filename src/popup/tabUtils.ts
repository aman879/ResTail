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

export async function sendMessageToProviderTab(
  provider: string,
  message: any,
  onStatusChange?: (status: string) => void
): Promise<any> {
  const url = PROVIDER_URLS[provider];
  const scriptFile = PROVIDER_SCRIPTS[provider];

  if (!url || !scriptFile) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  // 1. Create a new background tab
  onStatusChange?.('opening_tab');
  const targetTab = await chrome.tabs.create({ url, active: false });
  const tabId = targetTab.id!;

  // 2. Wait for the tab to finish loading
  onStatusChange?.('loading_page');
  await new Promise<void>((resolve) => {
    const listener = (updatedTabId: number, info: any) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    
    // Safety timeout — 30 seconds
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });

  // Give the SPA time to initialize
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 3. Inject content script
  onStatusChange?.('injecting_script');
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [scriptFile]
    });
  } catch (injectionError: any) {
    // Close tab if script injection fails
    chrome.tabs.remove(tabId).catch(() => {});
    throw new Error(`Failed to inject script into ${provider} tab: ${injectionError.message}`);
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  // 4. Send message and poll for response
  onStatusChange?.('sending_prompt');
  
  let lastError = '';
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const result = await new Promise<any>((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            reject({ isConnectionError: true, message: chrome.runtime.lastError.message });
            return;
          }
          if (response && response.error) {
            reject({ isConnectionError: false, message: response.error });
            return;
          }
          resolve(response);
        });
      });
      
      // Clean up: Close the tab on success
      chrome.tabs.remove(tabId).catch(() => {});
      return result;
    } catch (err: any) {
      // If it's a functional error (AI error, selector error), do not retry. Throw immediately.
      if (err && err.isConnectionError === false) {
        chrome.tabs.remove(tabId).catch(() => {});
        throw new Error(err.message);
      }
      
      lastError = err.message || 'Unknown connection error';
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Clean up: Close the tab on failure
  chrome.tabs.remove(tabId).catch(() => {});
  throw new Error(`Could not communicate with ${provider}: ${lastError}`);
}
