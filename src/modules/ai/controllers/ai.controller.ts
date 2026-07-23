import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiService } from '../services/ai.service';
import { AnalyzeCampaignDto } from '../dto/analyze-campaign.dto';
import { ChatMessageDto } from '../dto/chat-message.dto';
import { GenerateReportDto } from '../dto/generate-report.dto';

@ApiTags('AI Engine')
@Controller('api/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('analyze/campaign/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analyze advertising campaign performance' })
  @ApiResponse({ status: 200, description: 'Campaign analysis and recommendations generated' })
  async analyzeCampaign(
    @Param('id') campaignId: string,
    @Body() body: Partial<AnalyzeCampaignDto>,
  ) {
    return this.aiService.analyzeCampaign(campaignId, body?.model, body?.provider);
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Conversational Marketing AI Assistant' })
  @ApiResponse({ status: 200, description: 'Assistant answer returned' })
  async chat(@Body() dto: ChatMessageDto) {
    return this.aiService.handleChat(
      dto.message,
      dto.conversationId,
      dto.campaignId,
      dto.userId,
      dto.provider,
    );
  }

  @Get('recommendations/:campaignId')
  @ApiOperation({ summary: 'Fetch recommendations for campaign' })
  @ApiResponse({ status: 200, description: 'List of campaign recommendations' })
  async getRecommendations(@Param('campaignId') campaignId: string) {
    return this.aiService.getRecommendations(campaignId);
  }

  @Post('reports/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate executive campaign summary report' })
  @ApiResponse({ status: 200, description: 'Generated report content' })
  async generateReport(@Body() dto: GenerateReportDto) {
    return this.aiService.generateReport(
      dto.timeframe,
      dto.campaignId,
      dto.userId,
      dto.provider,
    );
  }
}
