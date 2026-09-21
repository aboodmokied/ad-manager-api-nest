import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeSafeClient as JevClient, choice } from '@typesafe-ai/sdk';
import { ClassificationResult } from './interfaces/agent.interface';

// Export JevClient type/alias for external consumers if needed
export { JevClient };

@Injectable()
export class JevService {
  private readonly logger = new Logger(JevService.name);
  private readonly jevClient: JevClient;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('TYPESAFE_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        'TYPESAFE_API_KEY is not defined in environment variables. JevClient requests will fail if unauthenticated.',
      );
    }

    // Initialize JevClient as a Singleton instance inside constructor
    this.jevClient = new JevClient({
      apiKey: apiKey || '',
    });

    this.logger.log('JevClient Singleton initialized successfully.');
  }

  /**
   * Classify user prompt to determine the best tool to execute using Jev model.
   *
   * @param prompt User query/instruction
   * @param tools Array of tools with name and description
   * @returns ClassificationResult with selectedTool, confidence, probabilities
   */
  async classifyAction(
    prompt: string,
    tools: Array<{ name: string; description: string }>,
  ): Promise<ClassificationResult> {
    this.logger.log(`Evaluating prompt for tool routing: "${prompt}"`);

    if (!tools || tools.length === 0) {
      throw new InternalServerErrorException(
        'No tools provided to JevService for classification.',
      );
    }

    try {
      // Build criteria map for Jev choice primitive: { [toolName]: description }
      const criteria: Record<string, string> = {};
      for (const tool of tools) {
        criteria[tool.name] = tool.description || `Execute action ${tool.name}`;
      }

      // Query Jev System One model
      const response = await this.jevClient.systemOne({
        state: prompt,
        questions: {
          action: choice(
            'Select the single most suitable tool to handle the user request',
            criteria,
          ),
        },
      });

      const decision = response.answers.action;

      this.logger.log(
        `Jev classification result -> Selected: "${decision.choice}", Confidence: ${decision.confidence}`,
      );

      return {
        selectedTool: decision.choice,
        confidence: decision.confidence,
        probabilities: decision.probabilities,
        model: response.model,
        usage: response.usage,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to classify action using Jev model: ${error?.message || error}`,
        error?.stack,
      );

      throw new InternalServerErrorException(
        `Jev Classification Error: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }
}
