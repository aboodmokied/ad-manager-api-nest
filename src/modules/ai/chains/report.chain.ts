import { Injectable, Logger } from '@nestjs/common';
import { LLMProviderFactory } from '../providers/llm-provider.factory';
import { LLMProviderType } from '../interfaces/llm-provider.interface';
import { ReportPrompt } from '../prompts/report.prompt';

@Injectable()
export class ReportChain {
  private readonly logger = new Logger(ReportChain.name);

  constructor(private readonly llmProviderFactory: LLMProviderFactory) {}

  /**
   * Orchestrates multi-step executive report generation pipeline
   */
  async execute(timeframe: string, reportMetrics: any, providerType?: LLMProviderType): Promise<string> {
    this.logger.log(`[ReportChain] Executing report generation chain for timeframe: ${timeframe}`);

    const systemPrompt = ReportPrompt.getSystemPrompt(timeframe);
    const userPrompt = ReportPrompt.buildUserPrompt(timeframe, reportMetrics);

    const provider = this.llmProviderFactory.getProvider(providerType);
    const response = await provider.generateResponse(userPrompt, { systemPrompt });
    return response.content;
  }
}
