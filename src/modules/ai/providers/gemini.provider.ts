import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LLMProvider,
  LLMProviderType,
  LLMRequestOptions,
  LLMResponse,
} from '../interfaces/llm-provider.interface';

@Injectable()
export class GeminiProvider implements LLMProvider {
  readonly providerType = LLMProviderType.GOOGLE;
  private readonly logger = new Logger(GeminiProvider.name);
  private apiKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_GEMINI_API_KEY') || this.configService.get<string>('GEMINI_API_KEY');
  }

  async generateResponse(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse> {
    const model = options?.model || 'gemini-1.5-pro';
    this.logger.log(`[Google Gemini] Generating response with model: ${model}`);

    if (!this.apiKey) {
      this.logger.warn(`GEMINI_API_KEY not configured. Falling back to simulated response.`);
      return {
        content: `[Gemini Simulated Response (${model})] Analysis for: "${prompt.slice(0, 80)}..."`,
        tokensUsed: { promptTokens: 90, completionTokens: 60, totalTokens: 150 },
        model,
        provider: this.providerType,
      };
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            ...(options?.systemPrompt
              ? [{ role: 'user', parts: [{ text: `System Instruction: ${options.systemPrompt}` }] }]
              : []),
            { role: 'user', parts: [{ text: prompt }] },
          ],
          generationConfig: {
            temperature: options?.temperature ?? 0.7,
            maxOutputTokens: options?.maxTokens ?? 1500,
            responseMimeType: options?.jsonMode ? 'application/json' : 'text/plain',
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Google Gemini API request failed');
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return {
        content: text,
        tokensUsed: {
          promptTokens: data.usageMetadata?.promptTokenCount || 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata?.totalTokenCount || 0,
        },
        model,
        provider: this.providerType,
      };
    } catch (error) {
      this.logger.error(`Gemini error: ${error.message}`);
      throw error;
    }
  }

  async analyze<T = any>(data: any, systemPrompt?: string, options?: LLMRequestOptions): Promise<T> {
    const prompt = `Analyze this dataset and return structured JSON:\n${JSON.stringify(data, null, 2)}`;
    const response = await this.generateResponse(prompt, {
      ...options,
      systemPrompt: systemPrompt || 'You are an advanced AI ad analyst. Return valid JSON strictly.',
      jsonMode: true,
    });

    try {
      return JSON.parse(response.content) as T;
    } catch {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      throw new Error('Failed to parse JSON response from Gemini');
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
