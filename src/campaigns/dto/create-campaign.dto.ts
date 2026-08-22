import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Platform } from '@prisma/client';
import { IsAfter } from '../../common/validators/is-after.decorator';

/** Maximum budget allowed by the Prisma Decimal(10,2) column. */
const MAX_BUDGET = 99_999_999.99;

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
 * The authenticated user (from the JWT) owns the campaign; no userId field.
 */
export class CreateCampaignDto {
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
  @Min(0.01)
  @Max(MAX_BUDGET)
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
  @IsAfter('startDate')
  endDate: string;

  @ApiProperty({
    description: 'List of platform configurations to create campaign on',
    type: [PlatformConfig],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlatformConfig)
  platforms: PlatformConfig[];
}
