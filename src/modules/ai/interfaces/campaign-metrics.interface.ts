export interface CampaignMetrics {
  campaignId?: string;
  campaignName?: string;
  platform?: string;
  impressions: number;
  clicks: number;
  ctr: number; // Click-Through Rate (%)
  cpc: number; // Cost Per Click ($)
  cpm: number; // Cost Per Mille / 1000 impressions ($)
  conversions: number;
  cost: number; // Total spend ($)
  revenue: number; // Total revenue ($)
  roas: number; // Return on Ad Spend (revenue / cost)
}

export interface CampaignComparison {
  campaigns: CampaignMetrics[];
  topPerformerId: string;
  weakestPerformerId: string;
  averageRoas: number;
  summary: string;
}
