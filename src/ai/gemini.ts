import type { AIProvider } from './provider';
import { AIProviderError } from './errors';
import { sleep } from './domUtils';

export class GeminiProvider implements AIProvider {
  id = 'gemini' as const;

  matchesUrl(url: string): boolean {
    return url.includes('gemini.google.com');
  }

  private findInput(): HTMLElement | null {
    // 1. Check light DOM selectors
    const lightSelectors = [
      '.ql-editor.textarea',
      '.ql-editor',
      'div[contenteditable="true"]',
      '[contenteditable="true"]',
    ];
    
    for (const sel of lightSelectors) {
      const el = document.querySelector(sel) as HTMLElement;
      if (el && el.getAttribute('contenteditable') === 'true') {
        return el;
      }
    }

    // 2. Check inside the custom <rich-textarea> shadow DOM
    const richTextarea = document.querySelector('rich-textarea');
    if (richTextarea) {
      if (richTextarea.shadowRoot) {
        const el = richTextarea.shadowRoot.querySelector('.ql-editor') || 
                   richTextarea.shadowRoot.querySelector('[contenteditable="true"]');
        if (el) return el as HTMLElement;
      }
      
      // Fallback: check if the rich-textarea has the class or contenteditable itself
      const innerEditor = richTextarea.querySelector('.ql-editor') as HTMLElement;
      if (innerEditor) return innerEditor;
      
      if (richTextarea.getAttribute('contenteditable') === 'true') {
        return richTextarea as HTMLElement;
      }
    }
    
    return null;
  }

  async isReady(): Promise<boolean> {
    // Wait for the input to appear (SPA may take time to render)
    for (let i = 0; i < 20; i++) {
      const input = this.findInput();
      if (input) {
        console.log('[ResTail] Found Gemini input element:', input);
        return true;
      }
      await sleep(500);
    }
    throw new AIProviderError('INPUT_NOT_FOUND', 'Could not find the Gemini chat input. Are you logged in?');
  }

  private findSendButton(): HTMLElement | null {
    const sendBtnSelectors = [
      'button[aria-label="Send message"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      '.send-button',
      'button[data-tooltip*="Send"]',
    ];
    
    // 1. Search light DOM
    for (const sel of sendBtnSelectors) {
      const btn = document.querySelector(sel) as HTMLButtonElement;
      if (btn && !btn.disabled) return btn;
    }

    // 2. Search inside rich-textarea shadow DOM
    const richTextarea = document.querySelector('rich-textarea');
    if (richTextarea && richTextarea.shadowRoot) {
      for (const sel of sendBtnSelectors) {
        const btn = richTextarea.shadowRoot.querySelector(sel) as HTMLButtonElement;
        if (btn && !btn.disabled) return btn;
      }
    }

    return null;
  }

  private findStopButton(): HTMLElement | null {
    const stopBtnSelectors = [
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]',
      'mat-icon[fonticon="stop_circle"]',
      '.stop-button'
    ];
    
    // 1. Search light DOM
    for (const sel of stopBtnSelectors) {
      const btn = document.querySelector(sel) as HTMLElement;
      if (btn) return btn;
    }

    // 2. Search inside rich-textarea shadow DOM
    const richTextarea = document.querySelector('rich-textarea');
    if (richTextarea && richTextarea.shadowRoot) {
      for (const sel of stopBtnSelectors) {
        const btn = richTextarea.shadowRoot.querySelector(sel) as HTMLElement;
        if (btn) return btn;
      }
    }

    return null;
  }

  async sendPrompt(prompt: string): Promise<string> {
    // 1. Find Input
    const input = this.findInput();
    if (!input) {
      throw new AIProviderError('INPUT_NOT_FOUND', 'Gemini chat input not found.');
    }

    // 2. Insert Prompt into contenteditable div
    input.focus();
    await sleep(200);
    
    // Clear existing content
    input.innerHTML = '';
    await sleep(100);
    
    // Simulate a paste event (works perfectly in background/unfocused tabs unlike execCommand)
    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', prompt);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true
      });
      input.dispatchEvent(pasteEvent);
      console.log('[ResTail] Simulated paste event dispatched.');
    } catch (pasteErr) {
      console.error('[ResTail] Paste simulation failed:', pasteErr);
    }
    
    // Fallback: execCommand (in case it is focused)
    document.execCommand('insertText', false, prompt);
    
    // Fire events to notify Gemini's framework
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    const richTextarea = document.querySelector('rich-textarea');
    if (richTextarea) {
      richTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    await sleep(800);

    // 3. Find and click the Send button (supporting Shadow DOM)
    let sendBtn: HTMLElement | null = null;
    
    // Wait up to 5 seconds for the button to become enabled
    for (let attempt = 0; attempt < 10; attempt++) {
      sendBtn = this.findSendButton();
      if (sendBtn) break;
      await sleep(500);
    }
    
    if (!sendBtn) {
      // Last resort: try to submit via Enter key
      console.warn('[ResTail] Send button not found or disabled. Attempting Enter key submit.');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      await sleep(500);
      const stillHasContent = input.textContent && input.textContent.trim().length > 0;
      if (stillHasContent) {
        throw new AIProviderError('SUBMIT_FAILED', 'Gemini send button not found or disabled.');
      }
    } else {
      sendBtn.click();
    }

    // Notify the popup that the prompt was submitted and the AI is generating
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'ai_generating' }).catch(() => {});

    const isVisible = (el: HTMLElement) => {
      return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    };

    // 4. Wait for generation to start (Stop button to appear and be visible)
    console.log('[ResTail] Prompt submitted. Waiting up to 10s for generation to start...');
    let started = false;
    for (let i = 0; i < 20; i++) {
      const stopBtn = this.findStopButton();
      if (stopBtn && isVisible(stopBtn as HTMLElement)) {
        started = true;
        console.log('[ResTail] Stop button detected. AI is generating.');
        break;
      }
      await sleep(500);
    }

    // 5. Wait for generation to complete
    if (started) {
      console.log('[ResTail] Monitoring generation status...');
      let timeout = 120000;
      const interval = 1000;

      while (timeout > 0) {
        const stopBtn = this.findStopButton();
        const isGenerating = stopBtn && isVisible(stopBtn as HTMLElement);
        console.log(`[ResTail] Generating: ${!!isGenerating}`);
        
        if (!isGenerating) {
          await sleep(2000); // double check
          const stillStopBtn = this.findStopButton();
          const stillGenerating = stillStopBtn && isVisible(stillStopBtn as HTMLElement);
          if (!stillGenerating) {
            console.log('[ResTail] Generation complete detected.');
            break;
          }
        }
        
        await sleep(interval);
        timeout -= interval;
      }

      if (timeout <= 0) {
        throw new AIProviderError('GENERATION_TIMEOUT', 'Timed out waiting for Gemini response.');
      }
    } else {
      console.log('[ResTail] Stop button did not appear within 10s. Checking if response was instant...');
    }

    // Notify the popup that the response is ready and we are extracting it
    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'extracting_response' }).catch(() => {});

    // 6. Extract Response — try multiple selectors
    const responseSelectors = [
      'message-content',
      '.model-response-text',
      '.response-container',
      '[data-message-author-role="model"]',
    ];
    
    let responseText = '';
    for (const sel of responseSelectors) {
      const messages = document.querySelectorAll(sel);
      if (messages && messages.length > 0) {
        const lastMessage = messages[messages.length - 1] as HTMLElement;
        
        // 1. Try to isolate and concatenate all LaTeX code blocks directly
        const preBlocks = lastMessage.querySelectorAll('pre');
        if (preBlocks && preBlocks.length > 0) {
          let joinedText = '';
          preBlocks.forEach((block) => {
            joinedText += (block.textContent || '') + '\n';
          });
          responseText = joinedText.trim();
          if (responseText) {
            console.log(`[ResTail] Found and joined ${preBlocks.length} code blocks.`);
            break;
          }
        }
        
        const codeBlocks = lastMessage.querySelectorAll('code');
        if (codeBlocks && codeBlocks.length > 0) {
          let joinedText = '';
          codeBlocks.forEach((block) => {
            joinedText += (block.textContent || '') + '\n';
          });
          responseText = joinedText.trim();
          if (responseText) {
            console.log(`[ResTail] Found and joined ${codeBlocks.length} inline/block code segments.`);
            break;
          }
        }
        
        // 2. Fallback to using the raw textContent (better than innerText for preserving backslashes and spacing)
        responseText = lastMessage.textContent || lastMessage.innerText || '';
        if (responseText.trim()) break;
      }
    }
    
    if (!responseText.trim()) {
      throw new AIProviderError('RESPONSE_NOT_FOUND', 'Could not find the Gemini response.');
    }

    return responseText;
  }
}
