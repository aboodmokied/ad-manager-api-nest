import { StructuredRecommendation } from './recommendation.interface';
import { CampaignMetrics } from './campaign-metrics.interface';

export enum AnalysisType {
  CAMPAIGN_PERFORMANCE = 'CAMPAIGN_PERFORMANCE',
  ANOMALY_DETECTION = 'ANOMALY_DETECTION',
  PERFORMANCE_PREDICTION = 'PERFORMANCE_PREDICTION',
}

export interface AIAnalysisResult {
  id?: string;
  campaignId: string;
  type: AnalysisType;
  summary: string;
  insights: {
    kpis: Partial<CampaignMetrics>;
    anomaliesFound?: string[];
    predictions?: string[];
    strengths?: string[];
    weaknesses?: string[];
  };
  recommendations: StructuredRecommendation[];
  createdAt?: Date;
}
