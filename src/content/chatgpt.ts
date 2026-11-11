import { ChatGPTProvider } from '../ai/chatgpt';

const provider = new ChatGPTProvider();

function safeRespond(sendResponse: (response?: any) => void, payload: any) {
  try {
    sendResponse(payload);
  } catch (_) {
    // Channel closed (e.g. service worker restarted or extension reloaded)
  }
}

chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.type === 'SEND_PROMPT') {
    (async () => {
      try {
        await provider.isReady();
        const text = await provider.sendPrompt(message.prompt, message.expect);
        safeRespond(sendResponse, { text });
      } catch (error: any) {
        console.error('[ResTail] ChatGPT automation failed:', error);
        safeRespond(sendResponse, { error: error?.message || 'Unknown error occurred.' });
      }
    })();
    return true; // Keep the message channel open for async response
  }
});
