import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LLMProvider,
  LLMProviderType,
  LLMRequestOptions,
  LLMResponse,
} from '../interfaces/llm-provider.interface';

@Injectable()
export class AnthropicProvider implements LLMProvider {
  readonly providerType = LLMProviderType.ANTHROPIC;
  private readonly logger = new Logger(AnthropicProvider.name);
  private apiKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
  }

  async generateResponse(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse> {
    const model = options?.model || 'claude-3-5-sonnet-20241022';
    this.logger.log(`[Anthropic] Generating response with model: ${model}`);

    if (!this.apiKey) {
      this.logger.warn(`ANTHROPIC_API_KEY not configured. Falling back to simulated response.`);
      return {
        content: `[Claude Simulated Response (${model})] Analysis for: "${prompt.slice(0, 80)}..."`,
        tokensUsed: { promptTokens: 100, completionTokens: 70, totalTokens: 170 },
        model,
        provider: this.providerType,
      };
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          system: options?.systemPrompt,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options?.maxTokens ?? 1500,
          temperature: options?.temperature ?? 0.7,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Anthropic API request failed');
      }

      const content = data.content?.[0]?.text || '';
      return {
        content,
        tokensUsed: {
          promptTokens: data.usage?.input_tokens || 0,
          completionTokens: data.usage?.output_tokens || 0,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
        model: data.model || model,
        provider: this.providerType,
      };
    } catch (error) {
      this.logger.error(`Anthropic error: ${error.message}`);
      throw error;
    }
  }

  async analyze<T = any>(data: any, systemPrompt?: string, options?: LLMRequestOptions): Promise<T> {
    const prompt = `Perform structured analysis on the following JSON dataset and output ONLY valid JSON:\n${JSON.stringify(
      data,
      null,
      2,
    )}`;
    const response = await this.generateResponse(prompt, {
      ...options,
      systemPrompt:
        systemPrompt || 'You are an elite marketing strategist AI. Output valid JSON only.',
    });

    try {
      return JSON.parse(response.content) as T;
    } catch {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      throw new Error('Failed to parse JSON response from Anthropic Claude');
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
