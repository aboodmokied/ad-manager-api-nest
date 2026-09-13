import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Platform } from '@prisma/client';
import { IsAfter } from '../../common/decorators/is-after.decorator';

/** Maximum budget allowed by the Prisma Decimal(10,2) column. */
const MAX_BUDGET = 99_999_999.99;

/**
 * Platform-specific configuration payload for campaign updates.
 */
export class UpdatePlatformConfigDto {
  @ApiPropertyOptional({
    description: 'The advertising platform to update configuration for',
    enum: Platform,
    example: Platform.META,
  })
  @IsEnum(Platform)
  platform: Platform;

  @ApiPropertyOptional({
    description: 'Updated platform-specific configuration data (unstructured JSON)',
    example: { targeting: { age: [21, 45], location: 'US' } },
  })
  @IsObject()
  platformSpecificData: any;
}

/**
 * DTO for updating an existing UACM campaign.
 * All fields are optional to allow partial updates.
 */
export class UpdateCampaignDto {
  @ApiPropertyOptional({
    description: 'Updated name of the campaign',
    example: 'Summer Sale Campaign - Revised',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated budget for the campaign in USD',
    example: 1500.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(MAX_BUDGET)
  budget?: number;

  @ApiPropertyOptional({
    description: 'Updated start date in ISO 8601 format',
    example: '2024-06-05T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Updated end date in ISO 8601 format',
    example: '2024-07-15T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  @IsAfter('startDate')
  endDate?: string;

  @ApiPropertyOptional({
    description:
      'Updated platform configurations per platform. Recommended for multi-platform campaigns.',
    type: [UpdatePlatformConfigDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePlatformConfigDto)
  platforms?: UpdatePlatformConfigDto[];

  @ApiPropertyOptional({
    description:
      'Updated platform-specific configuration data applied across all platforms (fallback for single-platform campaigns)',
    example: { targeting: { age: [21, 45], location: 'US' } },
  })
  @IsOptional()
  @IsObject()
  platformSpecificData?: any;
}
