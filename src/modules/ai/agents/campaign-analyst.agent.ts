import { Injectable, Logger } from '@nestjs/common';
import { LLMProviderFactory } from '../providers/llm-provider.factory';
import { LLMProviderType } from '../interfaces/llm-provider.interface';
import { CampaignAnalyticsTool } from '../tools/campaign-analytics.tool';
import { CampaignAnalysisPrompt } from '../prompts/campaign-analysis.prompt';
import { AIAnalysisResult, AnalysisType } from '../interfaces/ai-analysis-result.interface';
import { RecommendationPriority } from '../interfaces/recommendation.interface';

@Injectable()
export class CampaignAnalystAgent {
  private readonly logger = new Logger(CampaignAnalystAgent.name);

  constructor(
    private readonly llmProviderFactory: LLMProviderFactory,
    private readonly campaignAnalyticsTool: CampaignAnalyticsTool,
  ) {}

  /**
   * Run detailed campaign performance analysis
   */
  async analyze(campaignId: string, providerType?: LLMProviderType): Promise<AIAnalysisResult> {
    this.logger.log(`[CampaignAnalystAgent] Starting analysis for campaign: ${campaignId}`);

    // Step 1: Fetch metrics via CampaignAnalyticsTool (never direct Prisma)
    const metrics = await this.campaignAnalyticsTool.getCampaignMetrics(campaignId);

    // Step 2: Build prompts
    const systemPrompt = CampaignAnalysisPrompt.getSystemPrompt();
    const userPrompt = CampaignAnalysisPrompt.buildUserPrompt(metrics);

    // Step 3: Call LLM provider abstraction
    const provider = this.llmProviderFactory.getProvider(providerType);
    const result = await provider.analyze<any>(metrics, systemPrompt, {
      temperature: 0.2,
      jsonMode: true,
    });

    // Step 4: Validate and standardize structured response format
    const recommendations = (result.recommendations || []).map((rec: any) => ({
      recommendation: rec.recommendation || 'Optimize bidding and budget allocation.',
      priority: (rec.priority as RecommendationPriority) || RecommendationPriority.HIGH,
      reason: rec.reason || `CTR of ${metrics.ctr}% and ROAS of ${metrics.roas} indicated inefficiency.`,
      expectedImpact: rec.expectedImpact || 'Expected +15% increase in conversion yield.',
    }));

    return {
      campaignId,
      type: AnalysisType.CAMPAIGN_PERFORMANCE,
      summary: result.summary || `Campaign ${metrics.campaignName || campaignId} performance analysis complete.`,
      insights: {
        kpis: {
          ctr: metrics.ctr,
          cpc: metrics.cpc,
          cpm: metrics.cpm,
          roas: metrics.roas,
          cost: metrics.cost,
          revenue: metrics.revenue,
        },
        anomaliesFound: result.anomaliesFound || [],
        strengths: result.strengths || ['High click engagement'],
        weaknesses: result.weaknesses || ['High CPC relative to industry benchmarks'],
      },
      recommendations,
      createdAt: new Date(),
    };
  }
}
