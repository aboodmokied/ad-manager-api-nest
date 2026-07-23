export enum RecommendationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum RecommendationCategory {
  BUDGET_OPTIMIZATION = 'BUDGET_OPTIMIZATION',
  AUDIENCE_IMPROVEMENT = 'AUDIENCE_IMPROVEMENT',
  CREATIVE_TWEAK = 'CREATIVE_TWEAK',
  SCHEDULING_ADJUSTMENT = 'SCHEDULING_ADJUSTMENT',
  GENERAL_PERFORMANCE = 'GENERAL_PERFORMANCE',
}

export interface StructuredRecommendation {
  recommendation: string;
  priority: RecommendationPriority;
  reason: string;
  expectedImpact: string;
  category?: RecommendationCategory;
  confidence?: number; // 0.0 to 1.0
}

export interface AIRecommendationResult {
  campaignId: string;
  recommendations: StructuredRecommendation[];
  generatedAt: Date;
}
