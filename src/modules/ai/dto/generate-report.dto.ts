import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LLMProviderType } from '../interfaces/llm-provider.interface';

export enum ReportTimeframe {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  EXECUTIVE = 'EXECUTIVE',
}

export class GenerateReportDto {
  @ApiPropertyOptional({ description: 'Optional campaign ID (or omit for all user campaigns)' })
  @IsString()
  @IsOptional()
  campaignId?: string;

  @ApiPropertyOptional({ enum: ReportTimeframe, default: ReportTimeframe.WEEKLY })
  @IsEnum(ReportTimeframe)
  @IsOptional()
  timeframe?: ReportTimeframe = ReportTimeframe.WEEKLY;

  @ApiPropertyOptional({ description: 'User ID requesting the report', default: 'user-default' })
  @IsString()
  @IsOptional()
  userId?: string = 'user-default';

  @ApiPropertyOptional({ enum: LLMProviderType })
  @IsEnum(LLMProviderType)
  @IsOptional()
  provider?: LLMProviderType;
}
