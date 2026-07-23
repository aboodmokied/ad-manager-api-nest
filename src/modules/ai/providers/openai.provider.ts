import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LLMProvider,
  LLMProviderType,
  LLMRequestOptions,
  LLMResponse,
} from '../interfaces/llm-provider.interface';

@Injectable()
export class OpenAiProvider implements LLMProvider {
  readonly providerType = LLMProviderType.OPENAI;
  private readonly logger = new Logger(OpenAiProvider.name);
  private apiKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
  }

  async generateResponse(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse> {
    const model = options?.model || 'gpt-4o';
    this.logger.log(`[OpenAI] Generating response with model: ${model}`);

    if (!this.apiKey) {
      this.logger.warn(`OPENAI_API_KEY not configured. Falling back to structured response.`);
      return {
        content: `[OpenAI Simulated Response (${model})] Based on the query: "${prompt.slice(0, 80)}..."`,
        tokensUsed: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
        model,
        provider: this.providerType,
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(options?.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
            { role: 'user', content: prompt },
          ],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1500,
          response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'OpenAI API request failed');
      }

      return {
        content: data.choices[0]?.message?.content || '',
        tokensUsed: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        model: data.model || model,
        provider: this.providerType,
      };
    } catch (error) {
      this.logger.error(`OpenAI error: ${error.message}`);
      throw error;
    }
  }

  async analyze<T = any>(data: any, systemPrompt?: string, options?: LLMRequestOptions): Promise<T> {
    const prompt = `Perform structured analysis on the following campaign dataset:\n${JSON.stringify(
      data,
      null,
      2,
    )}`;
    const response = await this.generateResponse(prompt, {
      ...options,
      systemPrompt:
        systemPrompt ||
        'You are an expert ad manager AI. Return your analysis strictly in JSON format.',
      jsonMode: true,
    });

    try {
      return JSON.parse(response.content) as T;
    } catch {
      // Fallback clean extraction if markdown code blocks exist
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      throw new Error('Failed to parse JSON response from OpenAI');
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
