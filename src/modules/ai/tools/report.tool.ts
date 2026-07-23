import { Injectable, Logger } from '@nestjs/common';
import { CampaignAnalyticsTool } from './campaign-analytics.tool';

@Injectable()
export class ReportTool {
  private readonly logger = new Logger(ReportTool.name);

  constructor(private readonly campaignAnalyticsTool: CampaignAnalyticsTool) {}

  /**
   * Generates formatted report metrics compilation
   */
  async generateReport(timeframe: string, campaignId?: string) {
    this.logger.log(`[ReportTool] Compiling ${timeframe} report metrics ${campaignId ? `for ${campaignId}` : ''}`);

    let metricsData: any;
    if (campaignId) {
      metricsData = await this.campaignAnalyticsTool.getCampaignMetrics(campaignId);
    } else {
      const topPerformers = await this.campaignAnalyticsTool.getBestPerformingCampaigns(10);
      const totalCost = topPerformers.reduce((sum, item) => sum + item.cost, 0);
      const totalRevenue = topPerformers.reduce((sum, item) => sum + item.revenue, 0);
      const totalConversions = topPerformers.reduce((sum, item) => sum + item.conversions, 0);

      metricsData = {
        totalCampaigns: topPerformers.length,
        totalSpend: totalCost,
        totalRevenue,
        totalConversions,
        averageRoas: totalCost > 0 ? parseFloat((totalRevenue / totalCost).toFixed(2)) : 0,
        campaigns: topPerformers,
      };
    }

    return {
      timeframe,
      generatedAt: new Date().toISOString(),
      metrics: metricsData,
    };
  }
}
