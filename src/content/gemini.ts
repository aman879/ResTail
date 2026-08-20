import { GeminiProvider } from '../ai/gemini';

const provider = new GeminiProvider();

chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.type === 'SEND_PROMPT') {
    (async () => {
      try {
        await provider.isReady();
        const text = await provider.sendPrompt(message.prompt);
        sendResponse({ text });
      } catch (error: any) {
        sendResponse({ error: error.message || 'Unknown error occurred.' });
      }
    })();
    return true; // Keep the message channel open for async response
  }
});
