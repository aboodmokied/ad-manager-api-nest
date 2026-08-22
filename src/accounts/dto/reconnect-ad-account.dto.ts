import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Request body for reconnecting an existing advertising account. */
export class ReconnectAdAccountDto {
  @ApiPropertyOptional({
    description:
      'Frontend URL (same origin as FRONTEND_URL) to redirect to after a successful linking.',
  })
  @IsOptional()
  @IsString()
  successRedirectUri?: string;

  @ApiPropertyOptional({
    description:
      'Frontend URL (same origin as FRONTEND_URL) to redirect to after a failed linking.',
  })
  @IsOptional()
  @IsString()
  failureRedirectUri?: string;
}
