import type { AIProvider } from './provider';
import { AIProviderError } from './errors';
import { sleep } from './domUtils';

/**
 * Implementation of the AIProvider interface for Google Gemini.
 * Handles DOM traversal, input injection, generation monitoring, and response extraction.
 */
export class GeminiProvider implements AIProvider {
  id = 'gemini' as const;

  /**
   * Checks if the given URL matches the Gemini provider domain.
   */
  matchesUrl(url: string): boolean {
    return url.includes('gemini.google.com');
  }

  /**
   * Attempts to locate the chat input element within the Gemini DOM, including shadow roots.
   */
  private findInput(): HTMLElement | null {
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

  /**
   * Waits for the Gemini chat interface to become fully loaded and interactive.
   */
  async isReady(): Promise<boolean> {
    // Wait for the input to appear (SPA may take time to render)
    for (let i = 0; i < 20; i++) {
      const input = this.findInput();
      if (input) {
        return true;
      }
      await sleep(500);
    }
    throw new AIProviderError('INPUT_NOT_FOUND', 'Could not find the Gemini chat input. Are you logged in?');
  }

  /**
   * Attempts to locate the submit button within the Gemini DOM.
   */
  private findSendButton(): HTMLElement | null {
    const sendBtnSelectors = [
      'button[aria-label="Send message"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      '.send-button',
      'button[data-tooltip*="Send"]',
    ];

    for (const sel of sendBtnSelectors) {
      const btn = document.querySelector(sel) as HTMLButtonElement;
      if (btn && !btn.disabled) return btn;
    }

    const richTextarea = document.querySelector('rich-textarea');
    if (richTextarea && richTextarea.shadowRoot) {
      for (const sel of sendBtnSelectors) {
        const btn = richTextarea.shadowRoot.querySelector(sel) as HTMLButtonElement;
        if (btn && !btn.disabled) return btn;
      }
    }

    return null;
  }
  /**
   * Find the stop button (visible only while Gemini is generating).
   */
  private isStopButtonVisible(): boolean {
    const selectors = [
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]',
      'mat-icon[fonticon="stop_circle"]',
    ];
    for (const sel of selectors) {
      if (document.querySelector(sel)) return true;
    }
    return false;
  }

  /**
   * Check if action buttons (Copy/Share) appear on the LAST response, indicating completion.
   */
  private hasCompletionIndicators(): boolean {
    const indicators = [
      'button[aria-label*="Copy"]',
      'button[aria-label*="copy"]',
      'button[aria-label*="Good response"]',
      'button[aria-label*="Bad response"]',
    ];
    const responseContainers = document.querySelectorAll('message-content, .model-response-text, .response-container, [data-message-author-role="model"]');
    if (responseContainers.length === 0) return false;

    // Look only at the LAST response
    const last = responseContainers[responseContainers.length - 1] as HTMLElement;
    const searchRoot = last.closest('.conversation-turn, .chat-turn, [class*="turn"]') || last.parentElement || last;

    for (const sel of indicators) {
      if (searchRoot && searchRoot.querySelector(sel)) return true;
    }
    return false;
  }

  /**
   * Wait for Gemini to finish generating.
   * Phase 1: Wait for Stop button to appear (generation starting).
   * Phase 2: Wait for Stop button to disappear (generation finished).
   * Phase 3: Wait for Action buttons or Redo button (UI settled).
   */
  private async waitForGenerationComplete(timeoutMs = 120_000): Promise<void> {
    const startTime = Date.now();
    const elapsed = () => Date.now() - startTime;

    // Phase 1: Wait for Stop button to appear (max 15s)
    let stopAppeared = false;
    for (let i = 0; i < 30; i++) {
      if (this.isStopButtonVisible()) {
        stopAppeared = true;
        break;
      }
      await sleep(500);
    }

    if (!stopAppeared) {
      console.warn(`[ResTail] Stop button never appeared after 15s. Checking for completion indicators anyway...`);
    }

    // Phase 2 & 3: Wait for stop to disappear AND completion indicators to appear
    let currentWaitSec = 10;
    while (elapsed() < timeoutMs) {
      const isGenerating = this.isStopButtonVisible();
      const hasActionButtons = this.hasCompletionIndicators();
      const hasRedo = this.findRegenerateButton() !== null;

      if (isGenerating) {
        await sleep(currentWaitSec * 1000);
        currentWaitSec = Math.max(2, currentWaitSec - 1);
        continue;
      }

      // Stop button is gone. Check if UI has settled.
      if (hasActionButtons || hasRedo) {
        await sleep(1000);

        if (!this.isStopButtonVisible()) {
          return;
        }
      }

      await sleep(1000);
    }

    console.warn(`[ResTail] Timeout (${timeoutMs}ms) waiting for generation to finish.`);
  }

  /**
   * Find the Redo button that Gemini shows after a stopped/failed response.
   */
  private findRegenerateButton(): HTMLElement | null {
    const selectors = [
      'button[aria-label="Redo"]',
      'button[aria-label*="Regenerate"]',
      'button[aria-label*="regenerate"]',
      'button[aria-label*="Retry"]',
      'button[aria-label*="retry"]',
      'button[aria-label*="Try again"]',
      'gem-icon-button button[aria-label="Redo"]',
      'button:has(mat-icon[data-mat-icon-name="refresh"])',
      'mat-icon[data-mat-icon-name="refresh"]',
    ];

    const responseContainers = document.querySelectorAll('message-content, .model-response-text, .response-container, [data-message-author-role="model"]');
    if (responseContainers.length > 0) {
      const last = responseContainers[responseContainers.length - 1] as HTMLElement;
      const searchRoot = last.closest('.conversation-turn, .chat-turn, [class*="turn"]') || last.parentElement || last;

      for (const sel of selectors) {
        const btn = searchRoot.querySelector(sel) as HTMLElement;
        if (btn) return btn;
      }
    }

    return null;
  }

  /**
   * Wait for the Redo button to appear and click it.
   */
  private async clickRedoButton(): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      const btn = this.findRegenerateButton();
      if (btn) {
        btn.click();
        return true;
      }
      await sleep(500);
    }
    console.warn('[ResTail] Redo button not found after 10s.');
    return false;
  }

  /**
   * Extract the response text from Gemini's DOM.
   */
  private extractResponseText(): string {
    const responseSelectors = [
      'message-content',
      '.model-response-text',
      '.response-container',
      '[data-message-author-role="model"]',
    ];

    for (const sel of responseSelectors) {
      const messages = document.querySelectorAll(sel);
      if (messages && messages.length > 0) {
        const lastMessage = messages[messages.length - 1] as HTMLElement;

        // Try code blocks first (most reliable for LaTeX)
        const preBlocks = lastMessage.querySelectorAll('pre');
        if (preBlocks && preBlocks.length > 0) {
          let joinedText = '';
          preBlocks.forEach((block) => {
            joinedText += (block.textContent || '') + '\n';
          });
          const text = joinedText.trim();
          if (text) {
            return text;
          }
        }

        const codeBlocks = lastMessage.querySelectorAll('code');
        if (codeBlocks && codeBlocks.length > 0) {
          let joinedText = '';
          codeBlocks.forEach((block) => {
            joinedText += (block.textContent || '') + '\n';
          });
          const text = joinedText.trim();
          if (text) {
            return text;
          }
        }

        // Fallback to raw textContent
        const text = lastMessage.textContent || lastMessage.innerText || '';
        if (text.trim()) return text;
      }
    }

    return '';
  }

  /**
   * Orchestrates the injection of the prompt into the chat and triggers the submission.
   */
  async sendPrompt(prompt: string): Promise<string> {
    const input = this.findInput();
    if (!input) {
      throw new AIProviderError('INPUT_NOT_FOUND', 'Gemini chat input not found.');
    }

    input.focus();
    await sleep(200);
    input.textContent = '';
    await sleep(100);

    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', prompt);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true
      });
      input.dispatchEvent(pasteEvent);
    } catch (_) { /* fallback below */ }

    document.execCommand('insertText', false, prompt);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const richTextarea = document.querySelector('rich-textarea');
    if (richTextarea) {
      richTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await sleep(800);

    let sendBtn: HTMLElement | null = null;
    for (let i = 0; i < 10; i++) {
      sendBtn = this.findSendButton();
      if (sendBtn) break;
      await sleep(500);
    }

    if (!sendBtn) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      await sleep(500);
      if (input.textContent && input.textContent.trim().length > 0) {
        throw new AIProviderError('SUBMIT_FAILED', 'Gemini send button not found or disabled.');
      }
    } else {
      sendBtn.click();
    }

    chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'ai_generating' }).catch(() => { });
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {

      // Wait for stop button to appear then disappear
      await this.waitForGenerationComplete();

      // FAILSAFE: Absolutely do not proceed to extraction if Stop button is still visible
      while (this.isStopButtonVisible()) {
        console.warn(`[ResTail-State] Failsafe: Stop button STILL visible. Waiting...`);
        await sleep(1000);
      }

      await sleep(3500); // DOM settle buffer

      chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'extracting_response' }).catch(() => { });

      // Extract response
      const responseText = this.extractResponseText();
      const hasContent = responseText.trim().length > 0;
      const hasRedoBtn = this.findRegenerateButton() !== null;
      const hasStoppedText = responseText.includes('You stopped this response');
      const isStopped = hasStoppedText || hasRedoBtn;

      if (hasContent && !isStopped) {
        return responseText;
      }

      // No valid response or it was stopped midway
      if (isStopped) {
        console.warn(`[ResTail] ✗ Generation was stopped midway on attempt ${attempt}.`);
      } else {
        console.warn(`[ResTail] ✗ No valid response content found on attempt ${attempt}.`);
      }

      if (attempt >= MAX_RETRIES) break;

      // Try clicking Redo
      const clicked = await this.clickRedoButton();

      if (clicked) {
        chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: 'ai_generating' }).catch(() => { });
        await sleep(1000);
        continue;
      } else {
        break; // Can't retry without Redo button
      }
    }

    throw new AIProviderError(
      'GENERATION_STOPPED',
      `Gemini failed to generate a response after ${MAX_RETRIES} attempts. Try again or use a different provider.`
    );
  }
}
