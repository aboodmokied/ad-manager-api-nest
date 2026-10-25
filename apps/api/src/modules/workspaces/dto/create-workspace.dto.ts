import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrencyCode } from '@uacm/shared-types';

export class CreateWorkspaceDto {
  @ApiProperty({
    description: 'Workspace name',
    example: 'Acme Corp Marketing',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Workspace name must be at least 2 characters' })
  @MaxLength(100, { message: 'Workspace name cannot exceed 100 characters' })
  name: string;

  @ApiPropertyOptional({
    description: 'Workspace slug (unique identifier)',
    example: 'acme-corp',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Slug must be at least 2 characters' })
  @MaxLength(100, { message: 'Slug cannot exceed 100 characters' })
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'Slug must contain only lowercase alphanumeric characters and hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({
    description: 'ISO-4217 Base currency code',
    enum: CurrencyCode,
    default: CurrencyCode.USD,
    example: 'USD',
  })
  @IsOptional()
  @IsEnum(CurrencyCode)
  baseCurrency?: CurrencyCode;
}
