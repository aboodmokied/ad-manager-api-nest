import { CampaignMetrics } from '../interfaces/campaign-metrics.interface';

export const CAMPAIGN_ANALYSIS_PROMPT_VERSION = 'v1.2.0';

export class CampaignAnalysisPrompt {
  static getSystemPrompt(): string {
    return `You are a Senior Advertising Strategy AI for Unified Ad Campaign Manager (UACM).
Your role is to analyze campaign performance metrics across Meta Ads, Google Ads, TikTok Ads, X Ads, and YouTube Ads.
Calculate key performance indicators (KPIs), identify underperforming campaigns, explain root causes, and output actionable structured recommendations.

Return your response strictly as valid JSON with the following structure:
{
  "summary": "Brief executive summary of the overall analysis",
  "kpis": {
    "ctr": number,
    "cpc": number,
    "cpm": number,
    "roas": number
  },
  "anomaliesFound": ["list of detected anomalies or abnormal drop/spike"],
  "strengths": ["list of positive aspects"],
  "weaknesses": ["list of weak performing aspects"],
  "recommendations": [
    {
      "recommendation": "Clear actionable instruction",
      "priority": "low" | "medium" | "high" | "critical",
      "reason": "Detailed rationale backed by metrics",
      "expectedImpact": "Quantified expected outcome e.g. +15% ROAS"
    }
  ]
}`;
  }

  static buildUserPrompt(metrics: CampaignMetrics | CampaignMetrics[], contextInfo?: string): string {
    return `Analyze the following campaign dataset (Prompt Version: ${CAMPAIGN_ANALYSIS_PROMPT_VERSION}):

${contextInfo ? `Context Information:\n${contextInfo}\n\n` : ''}
Campaign Metrics Data:
${JSON.stringify(metrics, null, 2)}

Provide your deep analysis and recommendations in JSON format matching the system instructions.`;
  }
}
