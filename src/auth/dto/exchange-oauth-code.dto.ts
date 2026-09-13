import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for exchanging a one-time OAuth code for tokens.
 *
 * After the Google OAuth callback redirects the browser to the frontend with
 * a short-lived `code` query parameter, the frontend POSTs this code to
 * `POST /auth/oauth/exchange` to receive the actual token pair (or 2FA
 * challenge). This keeps JWTs out of URLs entirely.
 */
export class ExchangeOAuthCodeDto {
  @ApiProperty({
    description:
      'One-time code received from the OAuth callback redirect URL',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsNotEmpty({ message: 'OAuth exchange code is required' })
  code: string;
}
