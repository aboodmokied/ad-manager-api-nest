import { Injectable, Logger } from '@nestjs/common';
import { LLMProviderFactory } from '../providers/llm-provider.factory';
import { LLMProviderType } from '../interfaces/llm-provider.interface';
import { CampaignAnalyticsTool } from '../tools/campaign-analytics.tool';
import { RedisChatMemoryService } from '../memory/redis-chat-memory.service';
import { MarketingAssistantPrompt } from '../prompts/marketing-assistant.prompt';

@Injectable()
export class MarketingAssistantAgent {
  private readonly logger = new Logger(MarketingAssistantAgent.name);

  constructor(
    private readonly llmProviderFactory: LLMProviderFactory,
    private readonly campaignAnalyticsTool: CampaignAnalyticsTool,
    private readonly chatMemoryService: RedisChatMemoryService,
  ) {}

  /**
   * Handle user conversation message with dynamic context, memory, and tool integration
   */
  async handleUserQuery(
    message: string,
    conversationId: string,
    campaignId?: string,
    providerType?: LLMProviderType,
  ): Promise<{ response: string; conversationId: string }> {
    this.logger.log(`[MarketingAssistantAgent] Handling query for conv: ${conversationId}`);

    // Step 1: Record user message in Redis chat memory
    await this.chatMemoryService.appendMessage(conversationId, 'user', message);

    // Step 2: Fetch recent history
    const history = await this.chatMemoryService.getRecentMessages(conversationId, 6);
    const historyText = history.map((h) => `${h.role.toUpperCase()}: ${h.content}`).join('\n');

    // Step 3: Retrieve campaign context if campaign ID is mentioned or provided
    let campaignContext: any = null;
    const detectedIdMatch = message.match(/(?:campaign|id)[:\s]+([a-zA-Z0-9_-]+)/i);
    const targetCampaignId = campaignId || (detectedIdMatch ? detectedIdMatch[1] : null);

    if (targetCampaignId) {
      campaignContext = await this.campaignAnalyticsTool.getCampaignMetrics(targetCampaignId);
    }

    // Step 4: Build system and user prompt templates
    const toolsAvailable = ['getCampaignMetrics', 'compareCampaigns', 'getAudienceData', 'generateReport'];
    const systemPrompt = MarketingAssistantPrompt.getSystemPrompt(toolsAvailable);
    const userPrompt = MarketingAssistantPrompt.buildConversationPrompt(message, historyText, campaignContext);

    // Step 5: Invoke LLM provider
    const provider = this.llmProviderFactory.getProvider(providerType);
    const llmResponse = await provider.generateResponse(userPrompt, {
      systemPrompt,
      temperature: 0.5,
    });

    const assistantContent = llmResponse.content;

    // Step 6: Append assistant response to Redis chat memory
    await this.chatMemoryService.appendMessage(conversationId, 'assistant', assistantContent);

    return {
      response: assistantContent,
      conversationId,
    };
  }
}
