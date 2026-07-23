export const REPORT_PROMPT_VERSION = 'v1.1.0';

export class ReportPrompt {
  static getSystemPrompt(timeframe: string = 'WEEKLY'): string {
    return `You are an Executive Marketing Report Agent for UACM.
Your responsibility is to synthesize aggregate advertising metrics into executive-ready reports for ${timeframe} timeframe.
Focus on key achievements, spend efficiency, revenue generated, overall ROAS, and strategic recommendations for next period.

Return your response in clean Markdown with sections:
# Executive Summary
## Key Performance Highlights
## Platform Comparison
## Risk & Anomaly Warnings
## Strategic Recommendations`;
  }

  static buildUserPrompt(timeframe: string, aggregatedMetrics: any): string {
    return `Generate a comprehensive ${timeframe} report based on the following aggregated campaign metrics:

Aggregated Data:
${JSON.stringify(aggregatedMetrics, null, 2)}

Ensure clear narrative explanations, formatting, and high-level insights for marketing directors and executives.`;
  }
}
