import {
  IsString,
  IsNumber,
  IsDateString,
  IsEnum,
  IsObject,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Platform } from '@prisma/client';

/**
 * Configuration for a specific ad platform
 */
class PlatformConfig {
  @ApiProperty({
    description: 'The advertising platform to use',
    enum: Platform,
    example: Platform.META,
  })
  @IsEnum(Platform)
  platform: Platform;

  @ApiProperty({
    description: 'Platform-specific configuration data (unstructured JSON)',
    example: { targeting: { age: [18, 35], location: 'US' } },
  })
  @IsObject()
  platformSpecificData: any;
}

/**
 * DTO for creating a new UACM campaign
 */
export class CreateCampaignDto {
  @ApiProperty({
    description: 'ID of the user creating the campaign',
    example: 'user_123',
  })
  @IsString()
  userId: string;

  @ApiProperty({
    description: 'Name of the campaign',
    example: 'Summer Sale Campaign',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Budget for the campaign in USD',
    example: 1000.0,
  })
  @IsNumber()
  budget: number;

  @ApiProperty({
    description: 'Start date of the campaign in ISO 8601 format',
    example: '2024-06-01T00:00:00.000Z',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End date of the campaign in ISO 8601 format',
    example: '2024-06-30T23:59:59.999Z',
  })
  @IsDateString()
  endDate: string;

  @ApiProperty({
    description: 'List of platform configurations to create campaign on',
    type: [PlatformConfig],
  })
  @IsObject({ each: true })
  platforms: PlatformConfig[];
}
