import { Injectable, Logger } from '@nestjs/common';
import { LLMProviderFactory } from '../providers/llm-provider.factory';
import { LLMProviderType } from '../interfaces/llm-provider.interface';
import { CampaignAnalysisPrompt } from '../prompts/campaign-analysis.prompt';
import { CampaignMetrics } from '../interfaces/campaign-metrics.interface';

@Injectable()
export class AnalysisChain {
  private readonly logger = new Logger(AnalysisChain.name);

  constructor(private readonly llmProviderFactory: LLMProviderFactory) {}

  /**
   * Orchestrate multi-step metrics processing and model analysis chain
   */
  async execute(metrics: CampaignMetrics, providerType?: LLMProviderType): Promise<any> {
    this.logger.log(`[AnalysisChain] Executing analysis pipeline for campaign ${metrics.campaignId}`);

    const systemPrompt = CampaignAnalysisPrompt.getSystemPrompt();
    const userPrompt = CampaignAnalysisPrompt.buildUserPrompt(metrics);

    const provider = this.llmProviderFactory.getProvider(providerType);
    return provider.analyze(metrics, systemPrompt, { jsonMode: true });
  }
}
