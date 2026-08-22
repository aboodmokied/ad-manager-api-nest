import { Injectable, Logger } from '@nestjs/common';
import { CampaignStatus, Platform } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_IMPORTED_CAMPAIGN_BUDGET,
  DEFAULT_IMPORTED_CAMPAIGN_DURATION_DAYS,
  MAX_IMPORTED_CAMPAIGN_BUDGET,
} from '../constants/accounts.constants';
import {
  CampaignImportResult,
  ImportedCampaign,
} from '../interfaces/accounts.interfaces';

/** Input of a single import run. */
export interface CampaignImportInput {
  userId: string;
  platform: Platform;
  tenantId: string;
  platformAccountId: string;
  campaigns: ImportedCampaign[];
}

/**
 * Persists campaigns retrieved from an advertising platform into the UACM
 * data model.
 *
 * Each platform campaign maps 1:1 to a UacmCampaign (source of truth) plus
 * a PlatformCampaign holding the external id and import metadata (tenant,
 * platform account, raw payload). Rows are upserted by the platform campaign
 * id, so re-imports update instead of duplicating.
 */
@Injectable()
export class CampaignImportService {
  private readonly logger = new Logger(CampaignImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async importCampaigns(
    input: CampaignImportInput,
  ): Promise<CampaignImportResult> {
    const result: CampaignImportResult = { imported: 0, updated: 0, failed: 0 };

    for (const campaign of input.campaigns) {
      try {
        const externalId = String(campaign.externalId ?? '').trim();
        if (!externalId) {
          result.failed++;
          continue;
        }

        const status = this.mapStatus(campaign.externalStatus);
        const budget = this.normalizeBudget(campaign.budget);
        const startDate = campaign.startDate ?? new Date();
        const endDate =
          campaign.endDate ??
          new Date(
            startDate.getTime() +
              DEFAULT_IMPORTED_CAMPAIGN_DURATION_DAYS * 24 * 60 * 60 * 1000,
          );
        const platformData = {
          imported: true,
          importedVia: 'oauth',
          platformAccountId: input.platformAccountId,
          tenantId: input.tenantId,
          importedAt: new Date().toISOString(),
          externalStatus: campaign.externalStatus ?? 'UNKNOWN',
          raw: campaign.raw,
        };

        // Platform campaign ids are global, so scope the lookup by owner:
        // without this, importing a campaign already imported by another user
        // would silently update their row instead of creating ours.
        const existing = await this.prisma.platformCampaign.findFirst({
          where: {
            platform: input.platform,
            platformCampaignId: externalId,
            uacmCampaign: { userId: input.userId },
          },
          include: { uacmCampaign: true },
        });

        if (existing) {
          await this.prisma.platformCampaign.update({
            where: { id: existing.id },
            data: { status, platformData },
          });
          result.updated++;
          continue;
        }

        const uacmCampaign = await this.prisma.uacmCampaign.create({
          data: {
            userId: input.userId,
            name: campaign.name,
            status,
            budget,
            startDate,
            endDate,
          },
        });

        await this.prisma.platformCampaign.create({
          data: {
            uacmCampaignId: uacmCampaign.id,
            platform: input.platform,
            platformCampaignId: externalId,
            platformData,
            status,
          },
        });
        result.imported++;
      } catch (error: any) {
        result.failed++;
        this.logger.warn(
          `Failed to import campaign "${campaign.name}" (${campaign.externalId}): ${
            error?.message ?? error
          }`,
        );
      }
    }

    if (result.failed > 0) {
      this.logger.warn(
        `Campaign import finished with failures: imported=${result.imported} updated=${result.updated} failed=${result.failed}`,
      );
    }
    return result;
  }

  /** Maps a platform status to the UACM campaign status. */
  private mapStatus(externalStatus: string | undefined): CampaignStatus {
    const status = (externalStatus ?? '').toUpperCase();
    if (status === 'PAUSED') {
      return CampaignStatus.PAUSED;
    }
    return CampaignStatus.ACTIVE;
  }

  /** Clamps the budget into the Decimal(10,2) column range. */
  private normalizeBudget(value: number | undefined): number {
    const numeric = Number(value);
    if (value === undefined || value === null || Number.isNaN(numeric)) {
      return DEFAULT_IMPORTED_CAMPAIGN_BUDGET;
    }
    const clamped = Math.max(
      0,
      Math.min(numeric, MAX_IMPORTED_CAMPAIGN_BUDGET),
    );
    return Math.round(clamped * 100) / 100;
  }
}
