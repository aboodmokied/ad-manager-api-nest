import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LLMProviderType } from '../interfaces/llm-provider.interface';

export class ChatMessageDto {
  @ApiProperty({ description: 'User message query for the marketing assistant' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ description: 'Existing conversation ID for context history' })
  @IsString()
  @IsOptional()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'Optional campaign ID context' })
  @IsString()
  @IsOptional()
  campaignId?: string;

  @ApiPropertyOptional({ description: 'User ID submitting request', default: 'user-default' })
  @IsString()
  @IsOptional()
  userId?: string = 'user-default';

  @ApiPropertyOptional({ enum: LLMProviderType })
  @IsEnum(LLMProviderType)
  @IsOptional()
  provider?: LLMProviderType;
}
