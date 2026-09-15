export type AIProviderErrorCode =
  | 'NOT_ON_PROVIDER'
  | 'NOT_LOGGED_IN'
  | 'INPUT_NOT_FOUND'
  | 'SUBMIT_FAILED'
  | 'GENERATION_TIMEOUT'
  | 'RESPONSE_NOT_FOUND'
  | 'INVALID_RESPONSE'
  | 'GENERATION_STOPPED';

export class AIProviderError extends Error {
  code: AIProviderErrorCode;
  constructor(code: AIProviderErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'AIProviderError';
  }
}
