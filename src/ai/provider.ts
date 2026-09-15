/**
 * Defines the standard interface for all AI provider implementations.
 * Providers are responsible for injecting prompts, monitoring the generation state,
 * and extracting the final generated response from their respective web interfaces.
 */
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
   * Orchestrates the entire interaction flow.
   * This includes inserting the prompt, submitting it, waiting for generation to complete,
   * and extracting the final raw text response from the AI.
   * 
   * @param prompt The complete compiled prompt string
   * @returns The raw string response from the AI
   */
  sendPrompt(prompt: string): Promise<string>;
}
