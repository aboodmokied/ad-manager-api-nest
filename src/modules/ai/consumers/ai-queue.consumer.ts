import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RabbitMQService } from '../../../rabbitmq/rabbitmq.service';
import { AiService } from '../services/ai.service';
import { LLMProviderType } from '../interfaces/llm-provider.interface';

@Injectable()
export class AiQueueConsumer implements OnModuleInit {
  private readonly logger = new Logger(AiQueueConsumer.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly aiService: AiService,
  ) {}

  async onModuleInit() {
    this.logger.log(`[AiQueueConsumer] Initializing RabbitMQ AI Task Queues...`);

    // Queue 1: ai.analysis
    await this.rabbitMQService.consume('ai.analysis', 'ai.analysis.*', async (msg) => {
      try {
        const payload = JSON.parse(msg.content.toString());
        this.logger.log(`[AiWorker] Processing heavy campaign analysis for campaign: ${payload.campaignId}`);
        await this.aiService.analyzeCampaign(
          payload.campaignId,
          payload.userId || 'system-worker',
          payload.provider as LLMProviderType,
        );
      } catch (err) {
        this.logger.error(`Error in ai.analysis consumer: ${err.message}`);
        throw err;
      }
    });

    // Queue 2: ai.report_generation
    await this.rabbitMQService.consume('ai.report_generation', 'ai.report.*', async (msg) => {
      try {
        const payload = JSON.parse(msg.content.toString());
        this.logger.log(`[AiWorker] Processing heavy report generation for timeframe: ${payload.timeframe}`);
        await this.aiService.generateReport(
          payload.timeframe,
          payload.campaignId,
          payload.userId || 'system-worker',
          payload.provider as LLMProviderType,
        );
      } catch (err) {
        this.logger.error(`Error in ai.report_generation consumer: ${err.message}`);
        throw err;
      }
    });

    // Queue 3: ai.prediction
    await this.rabbitMQService.consume('ai.prediction', 'ai.prediction.*', async (msg) => {
      try {
        const payload = JSON.parse(msg.content.toString());
        this.logger.log(`[AiWorker] Processing campaign performance prediction for campaign: ${payload.campaignId}`);
        await this.aiService.analyzeCampaign(
          payload.campaignId,
          payload.userId || 'system-worker',
          payload.provider as LLMProviderType,
        );
      } catch (err) {
        this.logger.error(`Error in ai.prediction consumer: ${err.message}`);
        throw err;
      }
    });
  }
}
