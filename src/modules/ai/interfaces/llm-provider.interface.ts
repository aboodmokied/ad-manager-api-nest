export enum LLMProviderType {
  OPENAI = 'OPENAI',
  ANTHROPIC = 'ANTHROPIC',
  GOOGLE = 'GOOGLE',
  OLLAMA = 'OLLAMA',
}

export interface LLMRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  jsonMode?: boolean;
}

export interface LLMResponse {
  content: string;
  tokensUsed?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  provider?: LLMProviderType;
}

export interface LLMProvider {
  readonly providerType: LLMProviderType;

  /**
   * Standard completion / response generation
   */
  generateResponse(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse>;

  /**
   * Structured analysis of inputs
   */
  analyze<T = any>(data: any, systemPrompt?: string, options?: LLMRequestOptions): Promise<T>;

  /**
   * Stream response tokens asynchronously
   */
  streamResponse(prompt: string, options?: LLMRequestOptions): AsyncIterable<string>;
}
