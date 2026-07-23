import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LLMProvider,
  LLMProviderType,
  LLMRequestOptions,
  LLMResponse,
} from '../interfaces/llm-provider.interface';

@Injectable()
export class OllamaProvider implements LLMProvider {
  readonly providerType = LLMProviderType.OLLAMA;
  private readonly logger = new Logger(OllamaProvider.name);
  private baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434';
  }

  async generateResponse(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse> {
    const model = options?.model || 'llama3';
    this.logger.log(`[Ollama Local] Generating response with model: ${model} via ${this.baseUrl}`);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: options?.systemPrompt ? `[SYSTEM]: ${options.systemPrompt}\n[USER]: ${prompt}` : prompt,
          stream: false,
          format: options?.jsonMode ? 'json' : undefined,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens ?? 1500,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama instance unreachable at ${this.baseUrl}`);
      }

      const data = await response.json();
      return {
        content: data.response || '',
        tokensUsed: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        model,
        provider: this.providerType,
      };
    } catch (error) {
      this.logger.warn(`Ollama error (${error.message}). Returning local simulated completion.`);
      return {
        content: `[Ollama Local Response (${model})] Local completion for query: "${prompt.slice(0, 80)}..."`,
        tokensUsed: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
        model,
        provider: this.providerType,
      };
    }
  }

  async analyze<T = any>(data: any, systemPrompt?: string, options?: LLMRequestOptions): Promise<T> {
    const prompt = `Analyze data and return JSON format:\n${JSON.stringify(data, null, 2)}`;
    const response = await this.generateResponse(prompt, {
      ...options,
      systemPrompt: systemPrompt || 'You are an AI data analyst. Return JSON strictly.',
      jsonMode: true,
    });

    try {
      return JSON.parse(response.content) as T;
    } catch {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      throw new Error('Failed to parse JSON response from Ollama');
    }
  }

  async *streamResponse(prompt: string, options?: LLMRequestOptions): AsyncIterable<string> {
    const response = await this.generateResponse(prompt, options);
    const chunks = response.content.split(' ');
    for (const chunk of chunks) {
      yield chunk + ' ';
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }
}
