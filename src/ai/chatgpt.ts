import type { AIProvider } from './provider';
import { AIProviderError } from './errors';
import { setNativeValue, sleep } from './domUtils';

/**
 * Implementation of the AIProvider interface for ChatGPT.
 * Manages interaction with the ChatGPT web interface, including input injection and response extraction.
 * 
 * @todo This provider is currently experimental/WIP and may not be fully functional in production.
 */
export class ChatGPTProvider implements AIProvider {
  id = 'chatgpt' as const;

  /**
   * Checks if the given URL matches the ChatGPT provider domain.
   */
  matchesUrl(url: string): boolean {
    return url.includes('chatgpt.com') || url.includes('chat.openai.com');
  }

  /**
   * Verifies if the ChatGPT interface is ready by checking for the prompt textarea.
   */
  async isReady(): Promise<boolean> {
    const input = document.querySelector('#prompt-textarea') || document.querySelector('[contenteditable="true"]');
    if (!input) {
      throw new AIProviderError('INPUT_NOT_FOUND', 'Could not find the chat input. Are you logged in?');
    }
    return true;
  }

  /**
   * Attempts to locate the submit button within the ChatGPT DOM.
   */
  private findSendButton(): HTMLButtonElement | null {
    const selectors = [
      'button[data-testid*="send-button"]',
      'button[data-testid="send-button"]',
      'button[data-testid="fruitjuice-send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send"]',
      '#prompt-textarea + button',
      'form button:has(svg)'
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel) as HTMLButtonElement | null;
      if (btn && !btn.disabled) {
        return btn;
      }
    }
    return null;
  }

  /**
   * Orchestrates the injection of the prompt into the ChatGPT interface and submits it.
   */
  async sendPrompt(prompt: string): Promise<string> {
    const input = document.querySelector('#prompt-textarea') || document.querySelector('[contenteditable="true"]');
    if (!input) {
      throw new AIProviderError('INPUT_NOT_FOUND', 'Chat input not found.');
    }

    (input as HTMLElement).focus();
    await sleep(200);

    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', prompt);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true
      });
      input.dispatchEvent(pasteEvent);
    } catch (err) {
      console.error('[ResTail] ChatGPT paste simulation error:', err);
    }

    // Fallback: execCommand and native setters
    document.execCommand('insertText', false, prompt);
    setNativeValue(input as HTMLElement, prompt);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(800);

    let sendBtn: HTMLButtonElement | null = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      sendBtn = this.findSendButton();
      if (sendBtn) break;
      await sleep(300);
    }

    if (!sendBtn) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      await sleep(1000);
      
      const stillHasContent = (input as HTMLTextAreaElement).value && (input as HTMLTextAreaElement).value.trim().length > 0;
      if (stillHasContent) {
        throw new AIProviderError('SUBMIT_FAILED', 'ChatGPT send button not found or remains disabled.');
      }
    } else {
      sendBtn.click();
    }

    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'ai_generating' }).catch(() => {});

    await sleep(2000);

    let timeout = 120000;
    const interval = 1000;
    while (timeout > 0) {
      const stopBtn = document.querySelector('button[aria-label="Stop generating"]') || 
                      document.querySelector('button[data-testid="stop-generating-button"]');
      if (!stopBtn) {
        await sleep(2000);
        const doubleCheckStopBtn = document.querySelector('button[aria-label="Stop generating"]') ||
                                   document.querySelector('button[data-testid="stop-generating-button"]');
        if (!doubleCheckStopBtn) {
           break; // Done generating
        }
      }
      await sleep(interval);
      timeout -= interval;
    }

    if (timeout <= 0) {
      throw new AIProviderError('GENERATION_TIMEOUT', 'Timed out waiting for response.');
    }

    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'extracting_response' }).catch(() => {});

    const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
    if (!messages || messages.length === 0) {
      throw new AIProviderError('RESPONSE_NOT_FOUND', 'Could not find the assistant response.');
    }
    
    const lastMessage = messages[messages.length - 1] as HTMLElement;
    
    let text = '';
    const preBlocks = lastMessage.querySelectorAll('pre');
    if (preBlocks && preBlocks.length > 0) {
      let joinedText = '';
      preBlocks.forEach((block) => {
        joinedText += (block.textContent || '') + '\n';
      });
      text = joinedText.trim();
    }

    if (!text) {
      const codeBlocks = lastMessage.querySelectorAll('code');
      if (codeBlocks && codeBlocks.length > 0) {
        let joinedText = '';
        codeBlocks.forEach((block) => {
          joinedText += (block.textContent || '') + '\n';
        });
        text = joinedText.trim();
      }
    }

    if (!text) {
      text = lastMessage.textContent || lastMessage.innerText || '';
    }

    if (!text || !text.trim()) {
      throw new AIProviderError('INVALID_RESPONSE', 'Extracted response is empty.');
    }

    return text;
  }
}
