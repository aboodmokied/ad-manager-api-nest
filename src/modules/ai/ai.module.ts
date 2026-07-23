import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { RabbitMQModule } from '../../rabbitmq/rabbitmq.module';
import { CampaignsModule } from '../../campaigns/campaigns.module';

// Controllers
import { AiController } from './controllers/ai.controller';

// Services
import { AiService } from './services/ai.service';
import { AiDatabaseService } from './services/ai-database.service';
import { AiCacheService } from './services/ai-cache.service';
import { RagService } from './services/rag.service';

// Providers
import { OpenAiProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { LLMProviderFactory } from './providers/llm-provider.factory';

// Agents
import { CampaignAnalystAgent } from './agents/campaign-analyst.agent';
import { OptimizationAgent } from './agents/optimization.agent';
import { ReportAgent } from './agents/report.agent';
import { MarketingAssistantAgent } from './agents/marketing-assistant.agent';

// Chains
import { AnalysisChain } from './chains/analysis.chain';
import { ReportChain } from './chains/report.chain';

// Tools
import { CampaignAnalyticsTool } from './tools/campaign-analytics.tool';
import { AudienceTool } from './tools/audience.tool';
import { ReportTool } from './tools/report.tool';

// Memory
import { RedisChatMemoryService } from './memory/redis-chat-memory.service';

// Consumers
import { AiQueueConsumer } from './consumers/ai-queue.consumer';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    RabbitMQModule,
    CampaignsModule,
  ],
  controllers: [AiController],
  providers: [
    // Core Services
    AiService,
    AiDatabaseService,
    AiCacheService,
    RagService,
    // Providers
    OpenAiProvider,
    AnthropicProvider,
    GeminiProvider,
    OllamaProvider,
    LLMProviderFactory,
    // Agents
    CampaignAnalystAgent,
    OptimizationAgent,
    ReportAgent,
    MarketingAssistantAgent,
    // Chains
    AnalysisChain,
    ReportChain,
    // Tools
    CampaignAnalyticsTool,
    AudienceTool,
    ReportTool,
    // Memory
    RedisChatMemoryService,
    // Consumers
    AiQueueConsumer,
  ],
  exports: [
    AiService,
    LLMProviderFactory,
    CampaignAnalystAgent,
    OptimizationAgent,
    ReportAgent,
    MarketingAssistantAgent,
  ],
})
export class AiModule {}
