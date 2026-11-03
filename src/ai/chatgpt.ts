import type { AIProvider } from './provider';
import { AIProviderError } from './errors';
import { setNativeValue, sleep } from './domUtils';
import { extractLatex, validateLatex } from '../resume/latex';

/**
 * Implementation of the AIProvider interface for ChatGPT (chatgpt.com).
 * Mirrors the architecture and resilience of GeminiProvider:
 * - Robust input detection (ProseMirror contenteditable div / textarea)
 * - Safe prompt injection (paste simulation + execCommand + native setters)
 * - Multi-phase generation monitoring (Stop button -> Action buttons / Redo)
 * - Clean response extraction (prioritizing code blocks while stripping headers)
 * - Automatic retry with Regenerate button up to 3 attempts
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
   * Attempts to locate the chat input element within ChatGPT's DOM.
   * Handles modern ProseMirror contenteditable div as well as legacy/mobile textarea.
   */
  private findInput(): HTMLElement | null {
    const selectors = [
      '#prompt-textarea',
      'div#prompt-textarea',
      'div[contenteditable="true"]#prompt-textarea',
      'div[contenteditable="true"][data-placeholder]',
      'div[contenteditable="true"].ProseMirror',
      'div[role="textbox"]',
      'div[contenteditable="true"]',
      'textarea#prompt-textarea',
      'textarea[data-id="root"]',
      'textarea',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLElement;
      if (el) {
        if (el.getAttribute('contenteditable') === 'true' || el.tagName.toLowerCase() === 'textarea') {
          return el;
        }
      }
    }

    return null;
  }

  /**
   * Waits for the ChatGPT chat interface to become fully loaded and interactive.
   */
  async isReady(): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      const input = this.findInput();
      if (input) {
        return true;
      }

      // Check if user is redirected to a login prompt
      const loginPrompt = document.querySelector('a[href*="/login"], button[data-testid="login-button"]');
      if (loginPrompt) {
        throw new AIProviderError('NOT_LOGGED_IN', 'Please log in to ChatGPT first.');
      }

      await sleep(500);
    }
    throw new AIProviderError('INPUT_NOT_FOUND', 'Could not find the ChatGPT chat input. Are you logged in?');
  }

  /**
   * Attempts to locate the submit button within the ChatGPT DOM.
   */
  private findSendButton(): HTMLElement | null {
    // Only specific selectors: generic fallbacks (e.g. `form button:has(svg)`) match the
    // attach / dictation buttons before the real send button has rendered.
    const selectors = [
      'button[data-testid="send-button"]',
      '#composer-submit-button',
      'button[data-testid*="send-button"]',
      'button[data-testid="fruitjuice-send-button"]',
      'button[data-testid="composer-send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
    ];

    for (const sel of selectors) {
      const btn = document.querySelector(sel) as HTMLButtonElement | null;
      if (btn && this.isVisible(btn)) {
        const isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';
        if (!isDisabled) {
          return btn;
        }
      }
    }

    return null;
  }

  /**
   * Status updates are best-effort: if the extension was reloaded, chrome.runtime
   * throws synchronously ("Extension context invalidated"), which .catch() can't handle.
   */
  private sendStatus(status: string): void {
    try {
      chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status }).catch(() => { });
    } catch (_) { /* extension context gone */ }
  }

  private getInputText(input: HTMLElement): string {
    return (input instanceof HTMLTextAreaElement ? input.value : input.textContent || '').trim();
  }

  private pressEnter(input: HTMLElement): void {
    input.focus();
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', opts));
    input.dispatchEvent(new KeyboardEvent('keypress', opts));
    input.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  /**
   * Submission is confirmed when the composer clears or generation starts.
   */
  private async waitForSubmit(input: HTMLElement, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const current = this.findInput() ?? input;
      if (this.getInputText(current).length === 0 || this.isStopButtonVisible()) {
        return true;
      }
      await sleep(250);
    }
    return false;
  }

  /**
   * Checks whether a DOM element is rendered and visible.
   */
  private isVisible(el: HTMLElement): boolean {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  /**
   * Find the stop button or check streaming indicator (visible while ChatGPT is generating).
   */
  private isStopButtonVisible(): boolean {
    // Keep these specific: broad matches (e.g. `form button:has(rect)`, `[class*="streaming"]`)
    // hit the voice-mode / dictation buttons after generation ends and never clear.
    const stopSelectors = [
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop generating"]',
      'button[aria-label="Stop streaming"]',
      'button[data-testid*="stop-generating"]',
    ];

    for (const sel of stopSelectors) {
      const el = document.querySelector(sel) as HTMLElement;
      if (el && this.isVisible(el)) {
        return true;
      }
    }

    const streamingEl = document.querySelector('.result-streaming');
    if (streamingEl && this.isVisible(streamingEl as HTMLElement)) {
      return true;
    }

    return false;
  }

  /**
   * When generation ends ChatGPT swaps the Stop button back to the voice / send button.
   */
  private isComposerIdle(): boolean {
    const selectors = [
      'button[data-testid="composer-speech-button"]',
      'button[aria-label*="voice" i]',
      'button[data-testid="send-button"]',
      '#composer-submit-button',
    ];
    return selectors.some((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      return !!el && this.isVisible(el) && el.getAttribute('data-testid') !== 'stop-button';
    });
  }

  /**
   * Buttons that only appear in the action bar under a *finished assistant* reply
   * (user messages only get Copy/Edit). Matched by aria-label since ChatGPT no
   * longer exposes data-testid / data-message-author-role on these.
   */
  private static readonly ASSISTANT_ACTION_SELECTORS = [
    'button[aria-label="Rate response"]',
    'button[aria-label="Regenerate response"]',
    'button[aria-label="Good response"]',
    'button[aria-label="Bad response"]',
    'button[aria-label="Read aloud"]',
  ];

  private static readonly LEGACY_RESPONSE_SELECTORS = [
    'div[data-message-author-role="assistant"]',
    'section[data-turn="assistant"]',
    '[data-turn="assistant"]',
    '.agent-turn',
    '[data-message-model-slug]',
  ];

  /** Last assistant action-bar button on the page (any of the assistant-only ones). */
  private findLastAssistantAction(): HTMLElement | null {
    const all = document.querySelectorAll<HTMLElement>(
      ChatGPTProvider.ASSISTANT_ACTION_SELECTORS.join(', ')
    );
    return all.length ? all[all.length - 1] : null;
  }

  /**
   * Locate the container of the last assistant reply.
   * 1. Legacy attribute selectors, if ChatGPT still renders them.
   * 2. Otherwise walk up from the last assistant action button until we reach an
   *    ancestor that contains the reply content (a code block or real text).
   */
  private findLastResponseContainer(): HTMLElement | null {
    for (const sel of ChatGPTProvider.LEGACY_RESPONSE_SELECTORS) {
      const nodes = document.querySelectorAll<HTMLElement>(sel);
      if (nodes.length) return nodes[nodes.length - 1];
    }

    const action = this.findLastAssistantAction();
    if (!action) return null;

    let el: HTMLElement | null = action.parentElement;
    while (el && el !== document.body) {
      // Don't climb into a wrapper spanning multiple assistant turns.
      const rateButtons = el.querySelectorAll('button[aria-label="Rate response"], button[aria-label="Regenerate response"]');
      if (rateButtons.length > 2) break;

      if (el.querySelector('pre, .markdown, .prose')) return el;

      const buttonsText = Array.from(el.querySelectorAll('button')).reduce((n, b) => n + (b.textContent || '').length, 0);
      const ownText = (el.textContent || '').length - buttonsText;
      // High threshold so small UI text near the action bar (e.g. "Do you like this
      // personality?" feedback prompt) isn't mistaken for the reply.
      if (ownText > 200) return el;

      el = el.parentElement;
    }
    return null;
  }

  /**
   * Completion signal: the assistant action bar (Rate / Regenerate) is rendered.
   */
  private hasCompletionIndicators(): boolean {
    return this.findLastAssistantAction() !== null;
  }

  /**
   * The Regenerate button on the last assistant reply.
   */
  private findRegenerateButton(): HTMLElement | null {
    const btns = document.querySelectorAll<HTMLElement>(
      'button[aria-label="Regenerate response"], button[aria-label="Regenerate"], button[aria-label*="Try again"], button[aria-label*="Retry"]'
    );
    return btns.length ? btns[btns.length - 1] : null;
  }

  /**
   * "Regenerate response" is a Radix menu trigger: it opens on pointerdown (not click),
   * then the actual action is a "Try again" menu item.
   */
  private async clickRedoButton(): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      const btn = this.findRegenerateButton();
      if (btn) {
        const isMenuTrigger = btn.getAttribute('aria-haspopup') === 'menu';
        if (!isMenuTrigger) {
          btn.click();
          return true;
        }

        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }));
        btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }));
        await sleep(400);
        if (btn.getAttribute('aria-expanded') !== 'true') {
          btn.click();
          await sleep(400);
        }

        for (let j = 0; j < 10; j++) {
          const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"], [role="menuitem"]'));
          const item = items.find((it) => /try again|regenerate|retry/i.test(it.textContent || ''));
          if (item) {
            item.click();
            return true;
          }
          await sleep(300);
        }
        console.warn('[ResTail] Regenerate menu opened but "Try again" item not found.');
        return false;
      }
      await sleep(500);
    }
    console.warn('[ResTail] ChatGPT regenerate button not found after 10s.');
    return false;
  }

  /**
   * Wait for ChatGPT to finish generating.
   * Phase 1: Wait for Stop button / streaming indicator to appear (generation starting).
   * Phase 2: Wait for Stop button to disappear (generation finished).
   * Phase 3: Wait for Action buttons or Regenerate button (UI settled).
   */
  private async waitForGenerationComplete(timeoutMs = 120_000): Promise<void> {
    const startTime = Date.now();
    const elapsed = () => Date.now() - startTime;

    // Phase 1: Wait for Stop button / streaming to appear (max 15s)
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

    // Phase 2: Done when not generating AND (UI signals completion OR text stable for a while)
    let lastText = '';
    let stableSince = Date.now();
    while (elapsed() < timeoutMs) {
      const isGenerating = this.isStopButtonVisible();
      const composerIdle = this.isComposerIdle();
      const hasActionButtons = this.hasCompletionIndicators();
      const hasRedo = this.findRegenerateButton() !== null;
      const text = this.extractResponseText();

      if (text !== lastText) {
        lastText = text;
        stableSince = Date.now();
      }
      const stableMs = Date.now() - stableSince;

      if (!isGenerating && text.trim().length > 0) {
        if ((hasActionButtons || hasRedo || composerIdle) && stableMs >= 2000) return;
        if (stableMs >= 8000) return;
      }

      await sleep(1000);
    }

    console.warn(`[ResTail] Timeout (${timeoutMs}ms) waiting for ChatGPT generation to finish.`);
  }

  /**
   * Extract the response text from ChatGPT's DOM.
   * Prioritizes code blocks (and extracts the inner <code> to avoid copying "Copy code" headers).
   */
  private extractResponseText(): string {
    const container = this.findLastResponseContainer();

    const fromCodeBlocks = (root: ParentNode): string => {
      const pres = root.querySelectorAll('pre');
      let joined = '';
      pres.forEach((block) => {
        const codeEl = block.querySelector('code');
        joined += ((codeEl ? codeEl.textContent : block.textContent) || '') + '\n';
      });
      return joined.trim();
    };

    if (container) {
      // Code blocks first (most reliable for LaTeX; skips "Copy code" headers)
      const code = fromCodeBlocks(container);
      if (code) return code;

      const inlineCode = Array.from(container.querySelectorAll('code')).map((c) => c.textContent || '').join('\n').trim();
      if (inlineCode) return inlineCode;

      const markdown = container.querySelector<HTMLElement>('.markdown, .prose');
      const text = (markdown?.innerText || container.innerText || container.textContent || '').trim();
      if (text) return text;
    }

    // Last resort: once the assistant action bar exists, the last <pre> on the page is the reply.
    if (this.findLastAssistantAction()) {
      const pres = document.querySelectorAll('main pre, pre');
      const last = pres[pres.length - 1];
      if (last) {
        const t = (last.querySelector('code')?.textContent || last.textContent || '').trim();
        if (t) return t;
      }
    }

    return '';
  }

  /**
   * Orchestrates the injection of the prompt into ChatGPT and triggers submission.
   * Features automatic retry and generation monitoring matching GeminiProvider.
   */
  async sendPrompt(prompt: string): Promise<string> {
    const input = this.findInput();
    if (!input) {
      throw new AIProviderError('INPUT_NOT_FOUND', 'ChatGPT chat input not found.');
    }

    input.focus();
    await sleep(200);

    // Clear existing content
    if (input instanceof HTMLTextAreaElement) {
      input.value = '';
    } else {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand('delete', false);
    }
    await sleep(100);

    // Simulate paste event (works in background/unfocused windows and updates ProseMirror)
    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', prompt);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(pasteEvent);
    } catch (_) { /* fallback below */ }

    await sleep(150);

    // Fallback injection only if the paste wasn't handled (avoids inserting the prompt twice)
    if (this.getInputText(input).length === 0) {
      if (input instanceof HTMLTextAreaElement) {
        setNativeValue(input, prompt);
      } else {
        document.execCommand('insertText', false, prompt);
      }
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await sleep(800);

    let sendBtn: HTMLElement | null = null;
    for (let i = 0; i < 25; i++) {
      sendBtn = this.findSendButton();
      if (sendBtn) break;
      await sleep(400);
    }

    if (sendBtn) {
      sendBtn.click();
    } else {
      this.pressEnter(input);
    }

    // Verify the prompt was actually submitted; retry via Enter / form submit if not.
    let submitted = await this.waitForSubmit(input, 3000);
    if (!submitted) {
      this.pressEnter(input);
      submitted = await this.waitForSubmit(input, 2000);
    }
    if (!submitted) {
      const form = input.closest('form');
      if (form) {
        try { form.requestSubmit(); } catch (_) { /* ignore */ }
        submitted = await this.waitForSubmit(input, 2000);
      }
    }
    if (!submitted) {
      throw new AIProviderError('SUBMIT_FAILED', 'ChatGPT send button not found or disabled.');
    }

    this.sendStatus('ai_generating');
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // Wait for stop button to appear then disappear
      await this.waitForGenerationComplete();

      // FAILSAFE: Absolutely do not proceed to extraction if Stop button is still visible
      for (let i = 0; i < 30 && this.isStopButtonVisible(); i++) {
        console.warn(`[ResTail-State] Failsafe: Stop button STILL visible. Waiting...`);
        await sleep(1000);
      }

      await sleep(3500); // DOM settle buffer

      this.sendStatus('extracting_response');

      // Extract response
      const responseText = this.extractResponseText();
      const hasContent = responseText.trim().length > 0;
      const hasRedoBtn = this.findRegenerateButton() !== null;
      const hasStoppedText = responseText.includes('You stopped this response') || responseText.includes('There was an error generating a response');
      const isStopped = hasStoppedText || (hasRedoBtn && !hasContent);

      const hasLatex = hasContent && validateLatex(extractLatex(responseText));

      if (hasLatex && !hasStoppedText) {
        return responseText;
      }

      // Out of retries: hand back whatever we got so the caller reports a specific error
      if (hasContent && !hasStoppedText && attempt >= MAX_RETRIES) {
        return responseText;
      }

      // No valid response, stopped midway, or reply didn't contain a full LaTeX document
      if (hasContent && !hasStoppedText) {
        console.warn(`[ResTail] ✗ Response had no complete LaTeX document on attempt ${attempt}. Regenerating...`);
      } else if (isStopped) {
        console.warn(`[ResTail] ✗ Generation was stopped midway or errored on attempt ${attempt}.`);
      } else {
        console.warn(`[ResTail] ✗ No valid response content found on attempt ${attempt}.`);
      }

      if (attempt >= MAX_RETRIES) break;

      // Try clicking Regenerate
      const clicked = await this.clickRedoButton();
      if (clicked) {
        this.sendStatus('ai_generating');
        await sleep(1000);
        continue;
      } else {
        break; // Can't retry without Regenerate button
      }
    }

    throw new AIProviderError(
      'GENERATION_STOPPED',
      `ChatGPT failed to generate a response after ${MAX_RETRIES} attempts. Try again or use a different provider.`
    );
  }
}
