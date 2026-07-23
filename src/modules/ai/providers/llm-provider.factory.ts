import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMProvider, LLMProviderType } from '../interfaces/llm-provider.interface';
import { OpenAiProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { OllamaProvider } from './ollama.provider';

@Injectable()
export class LLMProviderFactory {
  private readonly logger = new Logger(LLMProviderFactory.name);
  private providers: Map<LLMProviderType, LLMProvider> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly openAiProvider: OpenAiProvider,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly geminiProvider: GeminiProvider,
    private readonly ollamaProvider: OllamaProvider,
  ) {
    this.providers.set(LLMProviderType.OPENAI, openAiProvider);
    this.providers.set(LLMProviderType.ANTHROPIC, anthropicProvider);
    this.providers.set(LLMProviderType.GOOGLE, geminiProvider);
    this.providers.set(LLMProviderType.OLLAMA, ollamaProvider);
  }

  /**
   * Get specific provider by type or default configured provider
   */
  getProvider(providerType?: LLMProviderType): LLMProvider {
    const defaultTypeString = this.configService.get<string>('DEFAULT_LLM_PROVIDER', 'OPENAI').toUpperCase();
    const resolvedType = providerType || (LLMProviderType[defaultTypeString as keyof typeof LLMProviderType] || LLMProviderType.OPENAI);

    const provider = this.providers.get(resolvedType);
    if (!provider) {
      this.logger.warn(`Provider ${resolvedType} not found. Falling back to OpenAI provider.`);
      return this.openAiProvider;
    }

    return provider;
  }
}
