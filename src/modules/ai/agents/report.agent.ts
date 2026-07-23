import { Injectable, Logger } from '@nestjs/common';
import { LLMProviderFactory } from '../providers/llm-provider.factory';
import { LLMProviderType } from '../interfaces/llm-provider.interface';
import { ReportTool } from '../tools/report.tool';
import { ReportPrompt } from '../prompts/report.prompt';

@Injectable()
export class ReportAgent {
  private readonly logger = new Logger(ReportAgent.name);

  constructor(
    private readonly llmProviderFactory: LLMProviderFactory,
    private readonly reportTool: ReportTool,
  ) {}

  /**
   * Generates formatted summaries and reports (Daily, Weekly, Monthly, Executive)
   */
  async generateReport(timeframe: string = 'WEEKLY', campaignId?: string, providerType?: LLMProviderType): Promise<string> {
    this.logger.log(`[ReportAgent] Generating ${timeframe} report ${campaignId ? `for campaign ${campaignId}` : ''}`);

    const reportData = await this.reportTool.generateReport(timeframe, campaignId);

    const systemPrompt = ReportPrompt.getSystemPrompt(timeframe);
    const userPrompt = ReportPrompt.buildUserPrompt(timeframe, reportData);

    const provider = this.llmProviderFactory.getProvider(providerType);
    const response = await provider.generateResponse(userPrompt, {
      systemPrompt,
      temperature: 0.3,
    });

    return response.content;
  }
}
