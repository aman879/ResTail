import type { AIProvider } from './provider';
import { AIProviderError } from './errors';
import { setNativeValue, sleep } from './domUtils';

export class ChatGPTProvider implements AIProvider {
  id = 'chatgpt' as const;

  matchesUrl(url: string): boolean {
    return url.includes('chatgpt.com') || url.includes('chat.openai.com');
  }

  async isReady(): Promise<boolean> {
    const input = document.querySelector('#prompt-textarea') || document.querySelector('[contenteditable="true"]');
    if (!input) {
      throw new AIProviderError('INPUT_NOT_FOUND', 'Could not find the chat input. Are you logged in?');
    }
    return true;
  }

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

  async sendPrompt(prompt: string): Promise<string> {
    // 1. Find Input
    const input = document.querySelector('#prompt-textarea') || document.querySelector('[contenteditable="true"]');
    if (!input) {
      throw new AIProviderError('INPUT_NOT_FOUND', 'Chat input not found.');
    }

    // 2. Focus and Insert Prompt via Clipboard Paste simulation
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
      console.log('[ResTail] Dispatched paste event for ChatGPT.');
    } catch (err) {
      console.error('[ResTail] ChatGPT paste simulation error:', err);
    }

    // Fallback: execCommand and native setters
    document.execCommand('insertText', false, prompt);
    setNativeValue(input as HTMLElement, prompt);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(800); // Wait for React state to process

    // 3. Find and click enabled send button
    let sendBtn: HTMLButtonElement | null = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      sendBtn = this.findSendButton();
      if (sendBtn) break;
      await sleep(300);
    }

    if (!sendBtn) {
      console.warn('[ResTail] Enabled send button not found. Attempting Enter key submit.');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      await sleep(1000);
      
      const stillHasContent = (input as HTMLTextAreaElement).value && (input as HTMLTextAreaElement).value.trim().length > 0;
      if (stillHasContent) {
        throw new AIProviderError('SUBMIT_FAILED', 'ChatGPT send button not found or remains disabled.');
      }
    } else {
      sendBtn.click();
    }

    // Notify popup that the AI is generating
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'ai_generating' }).catch(() => {});

    // 4. Wait for generation to start
    await sleep(2000);

    // 5. Wait for generation to complete (polling Stop button)
    let timeout = 120000; // 2 minutes max wait
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

    // Notify popup that response is ready for extraction
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'extracting_response' }).catch(() => {});

    // 6. Extract Response
    const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
    if (!messages || messages.length === 0) {
      throw new AIProviderError('RESPONSE_NOT_FOUND', 'Could not find the assistant response.');
    }
    
    const lastMessage = messages[messages.length - 1] as HTMLElement;
    
    // Attempt to isolate and concatenate all LaTeX code blocks
    let text = '';
    const preBlocks = lastMessage.querySelectorAll('pre');
    if (preBlocks && preBlocks.length > 0) {
      let joinedText = '';
      preBlocks.forEach((block) => {
        joinedText += (block.textContent || '') + '\n';
      });
      text = joinedText.trim();
      if (text) {
        console.log(`[ResTail] Extracted and joined ${preBlocks.length} code blocks from ChatGPT.`);
      }
    }

    if (!text) {
      const codeBlocks = lastMessage.querySelectorAll('code');
      if (codeBlocks && codeBlocks.length > 0) {
        let joinedText = '';
        codeBlocks.forEach((block) => {
          joinedText += (block.textContent || '') + '\n';
        });
        text = joinedText.trim();
        if (text) {
          console.log(`[ResTail] Extracted and joined ${codeBlocks.length} inline/block code elements from ChatGPT.`);
        }
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
