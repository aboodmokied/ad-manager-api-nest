import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Platform } from '@prisma/client';

/**
 * Request body for starting an OAuth linking flow (JSON variant).
 * The browser variant uses GET /ad-accounts/connect/:platform instead.
 */
export class ConnectAdAccountDto {
  @ApiProperty({
    enum: Platform,
    description: 'Advertising platform to connect (META or GOOGLE)',
    example: Platform.META,
  })
  @IsEnum(Platform)
  platform: Platform;

  @ApiPropertyOptional({
    description:
      'Specific ad account to import from (Meta ad account id or Google Ads customer id). ' +
      'When omitted the first accessible account is used.',
    example: 'act_1122334455667788',
  })
  @IsOptional()
  @IsString()
  adAccountId?: string;

  @ApiPropertyOptional({
    description:
      'Frontend URL (same origin as FRONTEND_URL) to redirect to after a successful linking.',
    example: 'http://localhost:3000/ad-accounts/connected',
  })
  @IsOptional()
  @IsString()
  successRedirectUri?: string;

  @ApiPropertyOptional({
    description:
      'Frontend URL (same origin as FRONTEND_URL) to redirect to after a failed linking.',
    example: 'http://localhost:3000/ad-accounts/connect-failed',
  })
  @IsOptional()
  @IsString()
  failureRedirectUri?: string;
}
