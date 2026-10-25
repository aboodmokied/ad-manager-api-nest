import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrencyCode } from '@uacm/shared-types';

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({
    description: 'Updated workspace name',
    example: 'Acme Corp Global',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Workspace name must be at least 2 characters' })
  @MaxLength(100, { message: 'Workspace name cannot exceed 100 characters' })
  name?: string;

  @ApiPropertyOptional({
    description: 'ISO-4217 Base currency code',
    enum: CurrencyCode,
    example: 'EUR',
  })
  @IsOptional()
  @IsEnum(CurrencyCode)
  baseCurrency?: CurrencyCode;
}
