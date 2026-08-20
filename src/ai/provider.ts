export interface AIProvider {
  id: 'chatgpt' | 'gemini' | 'claude';
  
  /**
   * Checks if the current page's URL matches this provider.
   */
  matchesUrl(url: string): boolean;

  /**
   * Detects if the provider is ready (e.g. user is logged in and input field is visible).
   * Should throw AIProviderError if not ready.
   */
  isReady(): Promise<boolean>;

  /**
   * Orchestrates the entire flow:
   * 1. Inserts prompt
   * 2. Submits
   * 3. Waits for generation
   * 4. Extracts latest response
   * @param prompt The complete compiled prompt string
   * @returns The raw string response from the AI
   */
  sendPrompt(prompt: string): Promise<string>;
}
