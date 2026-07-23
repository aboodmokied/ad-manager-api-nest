import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RecommendationType, AnalysisType, LLMProvider } from '@prisma/client';
import { StructuredRecommendation } from '../interfaces/recommendation.interface';
import { AIAnalysisResult } from '../interfaces/ai-analysis-result.interface';

@Injectable()
export class AiDatabaseService {
  private readonly logger = new Logger(AiDatabaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Save AI Recommendation to database
   */
  async saveRecommendation(campaignId: string, rec: StructuredRecommendation) {
    return this.prisma.aIRecommendation.create({
      data: {
        campaignId,
        type: (rec.category as RecommendationType) || RecommendationType.GENERAL_PERFORMANCE,
        description: rec.recommendation,
        priority: rec.priority || 'medium',
        confidence: rec.confidence || 0.85,
        reason: rec.reason,
        expectedImpact: rec.expectedImpact,
      },
    });
  }

  /**
   * Fetch saved recommendations for a campaign
   */
  async getRecommendationsByCampaign(campaignId: string) {
    return this.prisma.aIRecommendation.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Save AI Analysis record
   */
  async saveAnalysis(campaignId: string, analysis: AIAnalysisResult) {
    return this.prisma.aIAnalysis.create({
      data: {
        campaignId,
        type: (analysis.type as AnalysisType) || AnalysisType.CAMPAIGN_PERFORMANCE,
        insights: analysis.insights as any,
        summary: analysis.summary,
      },
    });
  }

  /**
   * Create or fetch conversation
   */
  async getOrCreateConversation(conversationId?: string, userId: string = 'user-default', title: string = 'New AI Strategy Chat') {
    if (conversationId) {
      const existing = await this.prisma.aIConversation.findUnique({
        where: { id: conversationId },
        include: { messages: true },
      });
      if (existing) return existing;
    }

    return this.prisma.aIConversation.create({
      data: {
        userId,
        title,
      },
      include: { messages: true },
    });
  }

  /**
   * Save message to database
   */
  async saveMessage(conversationId: string, role: string, content: string, metadata?: any) {
    return this.prisma.aIMessage.create({
      data: {
        conversationId,
        role,
        content,
        metadata: metadata || {},
      },
    });
  }

  /**
   * Track token usage & estimated cost
   */
  async trackUsage(params: {
    userId: string;
    conversationId?: string;
    provider: LLMProvider;
    model: string;
    promptTokens: number;
    completionTokens: number;
    costEstimate?: number;
    requestType: string;
  }) {
    const totalTokens = params.promptTokens + params.completionTokens;
    return this.prisma.aIUsage.create({
      data: {
        userId: params.userId,
        conversationId: params.conversationId,
        provider: params.provider,
        model: params.model,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        totalTokens,
        cost: params.costEstimate || (totalTokens * 0.000015),
        requestType: params.requestType,
      },
    });
  }
}
