import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { LLMProviderType } from '../interfaces/llm-provider.interface';
import { CampaignAnalystAgent } from '../agents/campaign-analyst.agent';
import { OptimizationAgent } from '../agents/optimization.agent';
import { ReportAgent } from '../agents/report.agent';
import { MarketingAssistantAgent } from '../agents/marketing-assistant.agent';
import { AiCacheService } from './ai-cache.service';
import { AiDatabaseService } from './ai-database.service';
import { RagService } from './rag.service';
import { LLMProvider } from '@prisma/client';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly campaignAnalystAgent: CampaignAnalystAgent,
    private readonly optimizationAgent: OptimizationAgent,
    private readonly reportAgent: ReportAgent,
    private readonly marketingAssistantAgent: MarketingAssistantAgent,
    private readonly aiCacheService: AiCacheService,
    private readonly aiDatabaseService: AiDatabaseService,
    private readonly ragService: RagService,
  ) {}

  /**
   * Sanitizes sensitive data / API keys / PII from text or logs
   */
  private filterSensitiveData(text: string): string {
    if (!text) return '';
    return text
      .replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***REDACTED***')
      .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ***REDACTED***');
  }

  /**
   * Validates user rate limits & basic authorization
   */
  private async validateUserAccess(userId: string): Promise<void> {
    const isAllowed = await this.aiCacheService.checkRateLimit(userId);
    if (!isAllowed) {
      throw new ForbiddenException(`AI request rate limit exceeded for user: ${userId}. Please try again later.`);
    }
  }

  /**
   * Analyze campaign performance with Redis caching & DB recording
   */
  async analyzeCampaign(campaignId: string, userId: string = 'user-default', provider?: LLMProviderType) {
    this.logger.log(`[AiService] Request to analyze campaign: ${campaignId} by user: ${userId}`);
    await this.validateUserAccess(userId);

    // Check Redis cache first
    const cached = await this.aiCacheService.getCachedCampaignAnalysis(campaignId);
    if (cached) {
      this.logger.log(`[AiService] Returning cached campaign analysis for ${campaignId}`);
      return cached;
    }

    // Run Campaign Analyst Agent
    const analysis = await this.campaignAnalystAgent.analyze(campaignId, provider);

    // Save to Database
    await this.aiDatabaseService.saveAnalysis(campaignId, analysis);

    // Save Recommendations to Database
    for (const rec of analysis.recommendations) {
      await this.aiDatabaseService.saveRecommendation(campaignId, rec);
    }

    // Track usage log
    await this.aiDatabaseService.trackUsage({
      userId,
      provider: (provider as unknown as LLMProvider) || LLMProvider.OPENAI,
      model: provider || 'default',
      promptTokens: 450,
      completionTokens: 250,
      requestType: 'analysis',
    });

    // Cache in Redis
    await this.aiCacheService.cacheCampaignAnalysis(campaignId, analysis);

    return analysis;
  }

  /**
   * Handle Marketing Assistant conversation with memory & RAG context
   */
  async handleChat(message: string, conversationId?: string, campaignId?: string, userId: string = 'user-default', provider?: LLMProviderType) {
    this.logger.log(`[AiService] Chat request from user: ${userId}`);
    await this.validateUserAccess(userId);

    const filteredMessage = this.filterSensitiveData(message);

    // Get or create conversation entity
    const conversation = await this.aiDatabaseService.getOrCreateConversation(conversationId, userId);

    // Process via MarketingAssistantAgent
    const result = await this.marketingAssistantAgent.handleUserQuery(filteredMessage, conversation.id, campaignId, provider);

    // Persist messages in Prisma
    await this.aiDatabaseService.saveMessage(conversation.id, 'user', filteredMessage);
    await this.aiDatabaseService.saveMessage(conversation.id, 'assistant', result.response);

    // Usage tracking
    await this.aiDatabaseService.trackUsage({
      userId,
      conversationId: conversation.id,
      provider: (provider as unknown as LLMProvider) || LLMProvider.OPENAI,
      model: provider || 'default',
      promptTokens: 300,
      completionTokens: 180,
      requestType: 'chat',
    });

    return {
      conversationId: conversation.id,
      response: result.response,
    };
  }

  /**
   * Get saved recommendations for campaign
   */
  async getRecommendations(campaignId: string) {
    this.logger.log(`[AiService] Fetching recommendations for campaign: ${campaignId}`);
    return this.aiDatabaseService.getRecommendationsByCampaign(campaignId);
  }

  /**
   * Generate Executive / Periodic Report
   */
  async generateReport(timeframe: string = 'WEEKLY', campaignId?: string, userId: string = 'user-default', provider?: LLMProviderType) {
    this.logger.log(`[AiService] Generating ${timeframe} report for user: ${userId}`);
    await this.validateUserAccess(userId);

    const reportMarkdown = await this.reportAgent.generateReport(timeframe, campaignId, provider);

    await this.aiDatabaseService.trackUsage({
      userId,
      provider: (provider as unknown as LLMProvider) || LLMProvider.OPENAI,
      model: provider || 'default',
      promptTokens: 600,
      completionTokens: 500,
      requestType: 'report',
    });

    return {
      timeframe,
      report: reportMarkdown,
      generatedAt: new Date(),
    };
  }
}
