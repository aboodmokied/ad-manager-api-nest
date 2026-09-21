export interface ToolDefinition {
  name: string;
  description: string;
  handler: (prompt: string, context?: Record<string, any>) => Promise<any> | any;
}

export interface ClassificationResult {
  selectedTool: string;
  confidence: number;
  probabilities: Record<string, number>;
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AgentExecutionResponse<T = any> {
  success: boolean;
  query: string;
  routing: ClassificationResult;
  data: T;
  timestamp: string;
}
