import type { AIProvider } from './provider';
import { AIProviderError } from './errors';
import { setNativeValue, sleep } from './domUtils';

export class ClaudeProvider implements AIProvider {
  id = 'claude' as const;

  matchesUrl(url: string): boolean {
    return url.includes('claude.ai');
  }

  async isReady(): Promise<boolean> {
    const input = document.querySelector('div[contenteditable="true"]');
    if (!input) {
      throw new AIProviderError('INPUT_NOT_FOUND', 'Could not find the Claude chat input. Are you logged in?');
    }
    return true;
  }

  async sendPrompt(prompt: string): Promise<string> {
    // 1. Find Input
    const input = document.querySelector('div[contenteditable="true"]');
    if (!input) {
      throw new AIProviderError('INPUT_NOT_FOUND', 'Claude chat input not found.');
    }

    // 2. Insert Prompt
    setNativeValue(input as HTMLElement, prompt);
    await sleep(500);

    // 3. Submit
    // Claude send button often has an aria-label like "Send Message"
    let sendBtn = document.querySelector('button[aria-label*="Send"]');
    if (!sendBtn || (sendBtn as HTMLButtonElement).disabled) {
      // Fallback for svg icons if label changes
      const buttons = document.querySelectorAll('button');
      for (const btn of Array.from(buttons)) {
        if (btn.innerHTML.includes('path') && btn.closest('fieldset')) {
          sendBtn = btn;
          break;
        }
      }
    }
    
    if (!sendBtn || (sendBtn as HTMLButtonElement).disabled) {
      throw new AIProviderError('SUBMIT_FAILED', 'Claude send button not found or disabled.');
    }
    (sendBtn as HTMLButtonElement).click();

    // 4. Wait for generation to start
    await sleep(3000);

    // 5. Wait for generation to complete
    let timeout = 120000;
    const interval = 1000;
    while (timeout > 0) {
      // Claude shows a Stop button while generating or completely hides the send button / changes its icon
      const stopBtn = document.querySelector('button[aria-label*="Stop"]');
      const isGenerating = !!stopBtn;
      
      if (!isGenerating) {
        await sleep(2000); // double check
        if (!document.querySelector('button[aria-label*="Stop"]')) {
          break;
        }
      }
      
      await sleep(interval);
      timeout -= interval;
    }

    if (timeout <= 0) {
      throw new AIProviderError('GENERATION_TIMEOUT', 'Timed out waiting for Claude response.');
    }

    // 6. Extract Response
    const messages = document.querySelectorAll('.font-claude-message');
    if (!messages || messages.length === 0) {
      throw new AIProviderError('RESPONSE_NOT_FOUND', 'Could not find the Claude response.');
    }
    
    const lastMessage = messages[messages.length - 1] as HTMLElement;
    const text = lastMessage.innerText || lastMessage.textContent;
    
    if (!text) {
      throw new AIProviderError('INVALID_RESPONSE', 'Extracted response is empty.');
    }

    return text;
  }
}
