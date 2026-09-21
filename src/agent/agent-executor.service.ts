import { Injectable, Logger } from '@nestjs/common';
import { JevService } from './jev.service';
import {
  AgentExecutionResponse,
  ClassificationResult,
  ToolDefinition,
} from './interfaces/agent.interface';

@Injectable()
export class AgentExecutorService {
  private readonly logger = new Logger(AgentExecutorService.name);

  // Strategy Registry: Tool Name -> Tool Definition
  private readonly toolRegistry = new Map<string, ToolDefinition>();

  constructor(private readonly jevService: JevService) {
    this.registerDefaultTools();
  }

  /**
   * Register default mock tools for testing and demonstration
   */
  private registerDefaultTools(): void {
    this.registerTool({
      name: 'get_user_info',
      description:
        'Retrieve user details, account profile, email address, or contact information',
      handler: async (prompt: string) => {
        this.logger.log(`Executing tool: get_user_info for query: "${prompt}"`);
        return {
          tool: 'get_user_info',
          status: 'success',
          data: {
            userId: 'usr_mock_001',
            fullName: 'John Doe',
            email: 'john.doe@example.com',
            role: 'Admin',
            status: 'ACTIVE',
          },
          note: 'Mock execution data returned for get_user_info',
        };
      },
    });

    this.registerTool({
      name: 'create_task',
      description:
        'Create a new task, todo item, reminder, calendar event, or schedule an action',
      handler: async (prompt: string) => {
        this.logger.log(`Executing tool: create_task for query: "${prompt}"`);
        return {
          tool: 'create_task',
          status: 'created',
          data: {
            taskId: `task_${Date.now()}`,
            title: prompt,
            status: 'PENDING',
            priority: 'NORMAL',
            createdAt: new Date().toISOString(),
          },
          note: 'Mock execution data returned for create_task',
        };
      },
    });

    this.registerTool({
      name: 'campaign_analytics',
      description:
        'Fetch advertising campaign performance, metrics, impressions, clicks, spend, and ROAS',
      handler: async (prompt: string) => {
        this.logger.log(
          `Executing tool: campaign_analytics for query: "${prompt}"`,
        );
        return {
          tool: 'campaign_analytics',
          status: 'success',
          data: {
            impressions: 48500,
            clicks: 2190,
            ctr: '4.51%',
            totalSpend: '$350.00',
            currency: 'USD',
          },
          note: 'Mock execution data returned for campaign_analytics',
        };
      },
    });

    this.registerTool({
      name: 'fallback',
      description:
        'Handle requests that do not clearly match any other specialized tool',
      handler: async (prompt: string) => {
        this.logger.log(`Executing tool: fallback for query: "${prompt}"`);
        return {
          tool: 'fallback',
          status: 'fallback_handled',
          message:
            'No specialized tool matched this request. General fallback response generated.',
          rawPrompt: prompt,
        };
      },
    });

    this.logger.log(
      `AgentExecutorService registered ${this.toolRegistry.size} tools in the registry.`,
    );
  }

  /**
   * Register a new tool dynamically into the Strategy Registry
   */
  public registerTool(tool: ToolDefinition): void {
    this.toolRegistry.set(tool.name, tool);
    this.logger.debug(`Registered tool strategy: "${tool.name}"`);
  }

  /**
   * Get all registered tools formatted for Jev classification
   */
  public getAvailableTools(): Array<{ name: string; description: string }> {
    return Array.from(this.toolRegistry.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  /**
   * Main execution pipeline:
   * 1. Send prompt + available tools to JevService for classification
   * 2. Route to the appropriate tool handler based on Jev's decision
   * 3. Return combined response (routing decision + execution output)
   */
  public async execute(prompt: string): Promise<AgentExecutionResponse> {
    this.logger.log(`Processing prompt with Jev router: "${prompt}"`);

    const availableTools = this.getAvailableTools();

    // 1. Classify with Jev
    const classification: ClassificationResult =
      await this.jevService.classifyAction(prompt, availableTools);

    // 2. Select handler based on classification
    let toolToExecute = this.toolRegistry.get(classification.selectedTool);

    if (!toolToExecute) {
      this.logger.warn(
        `Tool "${classification.selectedTool}" decided by Jev was not found in registry. Falling back to default handler.`,
      );
      toolToExecute = this.toolRegistry.get('fallback');
    }

    // 3. Execute tool strategy
    let executionData: any;
    try {
      executionData = await toolToExecute.handler(prompt);
    } catch (execError: any) {
      this.logger.error(
        `Error executing tool "${toolToExecute.name}": ${execError?.message || execError}`,
        execError?.stack,
      );
      executionData = {
        error: true,
        tool: toolToExecute.name,
        message: execError?.message || 'Tool execution failed',
      };
    }

    // 4. Return combined response
    return {
      success: true,
      query: prompt,
      routing: classification,
      data: executionData,
      timestamp: new Date().toISOString(),
    };
  }
}
