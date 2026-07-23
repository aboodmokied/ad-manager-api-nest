import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LLMProviderType } from '../interfaces/llm-provider.interface';
import { AnalysisType } from '../interfaces/ai-analysis-result.interface';

export class AnalyzeCampaignDto {
  @ApiProperty({ description: 'Campaign ID to analyze' })
  @IsString()
  @IsNotEmpty()
  campaignId: string;

  @ApiPropertyOptional({ enum: AnalysisType, default: AnalysisType.CAMPAIGN_PERFORMANCE })
  @IsEnum(AnalysisType)
  @IsOptional()
  analysisType?: AnalysisType = AnalysisType.CAMPAIGN_PERFORMANCE;

  @ApiPropertyOptional({ enum: LLMProviderType, description: 'Optional provider override' })
  @IsEnum(LLMProviderType)
  @IsOptional()
  provider?: LLMProviderType;

  @ApiPropertyOptional({ description: 'Optional model override (e.g. gpt-4o, claude-3-5-sonnet)' })
  @IsString()
  @IsOptional()
  model?: string;
}
