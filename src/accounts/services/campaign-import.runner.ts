import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenVaultService } from './token-vault.service';
import { ConnectorFactory } from '../connectors/connector-factory';
import { OAuthConfigService } from './oauth-config.service';
import { CampaignImportService } from './campaign-import.service';
import {
  CampaignImportResult,
  ImportRequestPayload,
} from '../interfaces/accounts.interfaces';

/**
 * Executes the campaign import for a connected account: resolves the
 * platform account(s) to import, retrieves campaigns with a fresh access
 * token and persists them through CampaignImportService.
 *
 * Shared by the RabbitMQ worker (async import right after linking) and the
 * "import now" endpoint (manual re-run). A valid token is required, so a
 * REAUTHORIZATION_REQUIRED account is blocked here.
 */
@Injectable()
export class CampaignImportRunner {
  private readonly logger = new Logger(CampaignImportRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenVault: TokenVaultService,
    private readonly connectorFactory: ConnectorFactory,
    private readonly oauthConfig: OAuthConfigService,
    private readonly campaignImport: CampaignImportService,
  ) {}

  async run(payload: ImportRequestPayload): Promise<CampaignImportResult> {
    const account = await this.prisma.connectedAccount.findUnique({
      where: { id: payload.accountId },
    });
    if (!account || account.userId !== payload.userId) {
      throw new NotFoundException('Advertising account not found');
    }

    // Blocks when the account is marked REAUTHORIZATION_REQUIRED and
    // transparently refreshes expired tokens before any platform call.
    const accessToken = await this.tokenVault.requireValidAccessToken(account);

    const config = this.oauthConfig.getConfig(payload.platform);
    const connector = this.connectorFactory.get(payload.platform);

    const platformAccounts = payload.adAccountId
      ? [{ id: payload.adAccountId, name: payload.adAccountId }]
      : await connector.listAccessibleAccounts(accessToken, config);

    const totals: CampaignImportResult = { imported: 0, updated: 0, failed: 0 };
    for (const platformAccount of platformAccounts) {
      const campaigns = await connector.listCampaigns(
        accessToken,
        platformAccount.id,
        config,
      );
      const result = await this.campaignImport.importCampaigns({
        userId: payload.userId,
        platform: payload.platform,
        tenantId: account.tenantId || payload.tenantId,
        platformAccountId: platformAccount.id,
        campaigns,
      });
      totals.imported += result.imported;
      totals.updated += result.updated;
      totals.failed += result.failed;
    }

    // Keep the connection metadata fresh: last sync time and the concrete
    // platform account that was imported (when it was not explicitly chosen).
    await this.prisma.connectedAccount.update({
      where: { id: payload.accountId },
      data: {
        lastSyncedAt: new Date(),
        platformAccountId:
          account.platformAccountId ?? platformAccounts[0]?.id ?? undefined,
      },
    });

    this.logger.log(
      `Import finished for account ${payload.accountId}: imported=${totals.imported} updated=${totals.updated} failed=${totals.failed}`,
    );
    return totals;
  }
}
