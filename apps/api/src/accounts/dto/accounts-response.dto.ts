import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Platform } from '@prisma/client';
import { ConnectionStatus } from '../constants/accounts.constants';

/** Public descriptor of a supported advertising platform. */
export class PlatformDescriptorDto {
  @ApiProperty({ enum: Platform, description: 'Platform enum value' })
  platform: Platform;

  @ApiProperty({ description: 'Human readable platform name' })
  displayName: string;

  @ApiProperty({ description: 'OAuth scopes requested for this platform' })
  scopes: string;
}

/** Result of starting an OAuth linking flow. */
export class ConnectResultDto {
  @ApiProperty({
    description: 'Provider authorization URL the browser should be sent to',
  })
  authorizationUrl: string;
}

/** Safe (token-free) view of a connected advertising account. */
export class ConnectedAccountViewDto {
  @ApiPropertyOptional({ description: 'Account id (null when disconnected)' })
  id: string | null;

  @ApiProperty({ enum: Platform, description: 'Advertising platform' })
  platform: Platform;

  @ApiProperty({ description: 'Human readable platform name' })
  platformDisplayName: string;

  @ApiProperty({
    enum: [
      'CONNECTED',
      'DISCONNECTED',
      'TOKEN_EXPIRED',
      'REAUTHORIZATION_REQUIRED',
    ],
    description: 'Current connection status of the account',
  })
  status: ConnectionStatus;

  @ApiPropertyOptional({
    description: 'When the access token expires (null = unknown)',
    type: Date,
  })
  expiresAt: Date | null;

  @ApiPropertyOptional({
    type: Date,
    description: 'When the account was linked',
  })
  connectedAt: Date | null;

  @ApiPropertyOptional({ type: Date, description: 'Last credential update' })
  updatedAt: Date | null;
}

/** Counters returned by a campaign import run. */
export class CampaignImportResultDto {
  @ApiProperty({ description: 'Campaigns newly imported' })
  imported: number;

  @ApiProperty({ description: 'Existing campaigns updated' })
  updated: number;

  @ApiProperty({ description: 'Campaigns that failed to import' })
  failed: number;
}

/** Campaign stored by the import (mirrors PlatformCampaign + UacmCampaign). */
export class ImportedCampaignViewDto {
  @ApiProperty({ description: 'Campaign id on the advertising platform' })
  externalId: string;

  @ApiProperty({ description: 'Campaign name' })
  name: string;

  @ApiProperty({ enum: ['PENDING', 'ACTIVE', 'PAUSED', 'ERROR'] })
  status: string;

  @ApiProperty({ description: 'Campaign budget in USD' })
  budget: number;

  @ApiProperty({ type: Date, description: 'Campaign start date' })
  startDate: Date;

  @ApiProperty({ type: Date, description: 'Campaign end date' })
  endDate: Date;

  @ApiProperty({
    description:
      'Import metadata (tenant, platform account, external status, raw payload)',
  })
  platformData: Record<string, unknown>;
}
