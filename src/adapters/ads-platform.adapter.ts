import { Platform } from '@prisma/client';

/**
 * Unified metrics interface - standardizes performance metrics across all ad platforms
 */
export interface UnifiedMetrics {
  impressions: number;    // Number of times the ad was shown
  clicks: number;         // Number of times the ad was clicked
  spend: number;          // Total amount spent (in USD)
  conversions: number;    // Number of conversions (e.g., purchases, sign-ups)
  ctr: number;            // Click-through rate (clicks / impressions)
  cpc: number;            // Cost per click (spend / clicks)
  roas?: number;          // Return on ad spend (optional, if available)
}

/**
 * Request payload for creating a campaign on an ad platform
 */
export interface CreateCampaignRequest {
  uacmCampaignId: string;      // ID of the UACM campaign
  name: string;                // Name of the campaign
  budget: number;              // Campaign budget
  startDate: Date;             // Campaign start date
  endDate: Date;               // Campaign end date
  platformSpecificData: any;   // Unstructured platform-specific configuration
}

/**
 * Request payload for updating a campaign's budget on an ad platform
 */
export interface UpdateBudgetRequest {
  platformCampaignId: string;  // ID of the campaign on the ad platform
  newBudget: number;           // New budget amount
}

/**
 * Interface that all ad platform adapters must implement
 * Defines the standard operations for interacting with ad platforms
 */
export interface AdsPlatformAdapter {
  /** The platform this adapter is for (e.g., META, GOOGLE) */
  platform: Platform;

  /**
   * Creates a new campaign on the ad platform
   * @param request - The campaign creation request
   * @param accessToken - OAuth access token for the platform
   * @returns The platform-specific campaign ID
   */
  createCampaign(request: CreateCampaignRequest, accessToken: string): Promise<string>;

  /**
   * Updates the budget of an existing campaign on the ad platform
   * @param request - The budget update request
   * @param accessToken - OAuth access token for the platform
   */
  updateBudget(request: UpdateBudgetRequest, accessToken: string): Promise<void>;

  /**
   * Retrieves performance insights for a campaign from the ad platform
   * @param platformCampaignId - ID of the campaign on the ad platform
   * @param accessToken - OAuth access token for the platform
   * @returns The campaign's performance metrics in unified format
   */
  getInsights(platformCampaignId: string, accessToken: string): Promise<UnifiedMetrics>;

  /**
   * Transforms raw platform-specific metrics into the unified metrics format
   * @param rawMetrics - The raw metrics from the ad platform
   * @returns The metrics in unified format
   */
  transformToUnifiedMetrics(rawMetrics: any): UnifiedMetrics;
}
