import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdapterFactory } from '../../adapters/adapter-factory.service';
import { RateLimiterService } from '../../common/services/rate-limiter.service';
import { IdempotencyService } from '../../common/services/idempotency.service';
import { TokenVaultService } from '../../accounts/services/token-vault.service';
import { CampaignEventsService } from '../events/campaign-events.service';
import { CampaignStatus, Platform } from '@prisma/client';
import { assertTransition, isValidTransition } from '../services/campaign-status-machine';

/** Interval between periodic sweeps for unhandled pending campaigns (5 minutes). */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** Minimum age before a pending campaign is considered stale during background sweeps (1 minute). */
const STALE_THRESHOLD_MS = 60 * 1000;

/** Maximum age of pending campaigns considered for republishing (24 hours). */
const MAX_SWEEP_AGE_MS = 24 * 60 * 60 * 1000;

interface CampaignCreatedPayload {
  uacmCampaignId: string;
  platformCampaignId: string;
  platform: Platform;
}

interface CampaignLifecyclePayload {
  uacmCampaignId: string;
  platformCampaignId: string;
  platform: Platform;
}

@Injectable()
export class CampaignsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignsWorker.name);
  private sweepInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly prisma: PrismaService,
    private readonly adapterFactory: AdapterFactory,
    private readonly rateLimiter: RateLimiterService,
    private readonly idempotencyService: IdempotencyService,
    private readonly tokenVault: TokenVaultService,
    @Optional() private readonly campaignEvents?: CampaignEventsService,
  ) {}

  async onModuleInit() {
    this.logger.log('Consuming campaign queues');

    await this.rabbitMQService.consume(
      'campaign_created_queue',
      'campaign.created',
      this.handleCampaignCreated.bind(this),
      { maxRetries: 5, dlq: 'campaign_created_dlq' },
    );

    await this.rabbitMQService.consume(
      'campaign_updated_queue',
      'campaign.updated',
      this.handleCampaignUpdated.bind(this),
      { maxRetries: 3, dlq: 'campaign_updated_dlq' },
    );

    await this.rabbitMQService.consume(
      'campaign_paused_queue',
      'campaign.paused',
      this.handleCampaignPaused.bind(this),
      { maxRetries: 3, dlq: 'campaign_paused_dlq' },
    );

    await this.rabbitMQService.consume(
      'campaign_resumed_queue',
      'campaign.resumed',
      this.handleCampaignResumed.bind(this),
      { maxRetries: 3, dlq: 'campaign_resumed_dlq' },
    );

    await this.republishPendingCampaigns(false).catch((error) => {
      this.logger.warn(
        `Startup pending campaign sweep failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    this.startPeriodicSweep();
  }

  onModuleDestroy() {
    this.stopPeriodicSweep();
  }

  private startPeriodicSweep(): void {
    this.sweepInterval = setInterval(() => {
      this.republishPendingCampaigns(true).catch((error) => {
        this.logger.warn(
          `Periodic pending campaign sweep failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
      // Cleanup stale idempotency records during the sweep.
      this.idempotencyService.cleanup(7).catch((error) => {
        this.logger.warn(
          `Idempotency cleanup failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, SWEEP_INTERVAL_MS);

    // Unref so the background timer does not hold open Node.js test runners
    if (this.sweepInterval.unref) {
      this.sweepInterval.unref();
    }
  }

  private stopPeriodicSweep(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  /**
   * Republishes campaign.created events for PENDING platform campaigns.
   * - On startup (staleOnly = false), republishes all pending campaigns from the last 24h.
   * - During periodic sweeps (staleOnly = true), only targets campaigns older than
   *   STALE_THRESHOLD_MS to avoid racing active in-flight requests.
   */
  private async republishPendingCampaigns(
    staleOnly = false,
  ): Promise<void> {
    const now = Date.now();
    const since = new Date(now - MAX_SWEEP_AGE_MS);
    const createdAtFilter: { gte: Date; lte?: Date } = { gte: since };

    if (staleOnly) {
      createdAtFilter.lte = new Date(now - STALE_THRESHOLD_MS);
    }

    const pending = await this.prisma.platformCampaign.findMany({
      where: {
        status: CampaignStatus.PENDING,
        createdAt: createdAtFilter,
      },
      take: 500,
    });

    if (pending.length === 0) {
      return;
    }

    this.logger.log(
      `Republishing ${pending.length} pending campaign creation event(s) (staleOnly=${staleOnly})`,
    );

    await Promise.all(
      pending.map((platformCampaign) =>
        this.rabbitMQService.publish('campaign.created', {
          uacmCampaignId: platformCampaign.uacmCampaignId,
          platformCampaignId: platformCampaign.id,
          platform: platformCampaign.platform,
        }),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  private async handleCampaignCreated(msg: any) {
    const payload = this.parsePayload(msg);

    const idempotencyKey = `campaign:${payload.platformCampaignId}`;

    // Skip work already completed (e.g. duplicate delivery after a crash).
    const alreadyProcessed =
      await this.idempotencyService.isProcessed(idempotencyKey);
    if (alreadyProcessed) {
      this.logger.log(
        `Campaign ${payload.platformCampaignId} already processed`,
      );
      return;
    }

    // Get platform campaign and connected account
    const platformCampaign = await this.prisma.platformCampaign.findUnique({
      where: { id: payload.platformCampaignId },
      include: { uacmCampaign: true },
    });

    if (!platformCampaign) {
      throw new Error(
        `Platform campaign ${payload.platformCampaignId} not found`,
      );
    }

    const connectedAccount = await this.prisma.connectedAccount.findFirst({
      where: {
        userId: platformCampaign.uacmCampaign.userId,
        platform: payload.platform,
      },
    });

    if (!connectedAccount) {
      await this.prisma.platformCampaign
        .update({
          where: { id: payload.platformCampaignId },
          data: { status: CampaignStatus.ERROR },
        })
        .catch((dbErr) => {
          this.logger.error(
            `Failed to set ERROR status for platform campaign ${payload.platformCampaignId}: ${dbErr?.message ?? dbErr}`,
          );
        });
      await this.reconcileUacmCampaignStatus(payload.uacmCampaignId);
      this.campaignEvents?.emit(
        platformCampaign.uacmCampaign.userId,
        'campaign.error',
        {
          id: payload.platformCampaignId,
          uacmCampaignId: payload.uacmCampaignId,
          platform: payload.platform,
          error: `No connected account for platform ${payload.platform}`,
        },
      );
      throw new Error(`No connected account for platform ${payload.platform}`);
    }

    // Check rate limit
    await this.enforceRateLimit(payload.platform, connectedAccount.id);

    // Get adapter and create campaign on platform
    try {
      const accessToken =
        await this.tokenVault.requireValidAccessToken(connectedAccount);
      const adapter = this.adapterFactory.getAdapter(payload.platform);

      // Avoid creating duplicate campaigns on the platform if external ID was already saved in a previous attempt
      let platformCampaignExternalId = platformCampaign.platformCampaignId;
      if (!platformCampaignExternalId) {
        platformCampaignExternalId = await adapter.createCampaign(
          {
            uacmCampaignId: payload.uacmCampaignId,
            name: platformCampaign.uacmCampaign.name,
            budget: platformCampaign.uacmCampaign.budget.toNumber(),
            startDate: platformCampaign.uacmCampaign.startDate,
            endDate: platformCampaign.uacmCampaign.endDate,
            platformSpecificData: platformCampaign.platformData,
          },
          accessToken,
        );
      }

      // Always persist the external ID and set status to ACTIVE:
      // the campaign exists on the platform regardless of previous local status.
      await this.prisma.platformCampaign.update({
        where: { id: payload.platformCampaignId },
        data: {
          status: CampaignStatus.ACTIVE,
          platformCampaignId: platformCampaignExternalId,
        },
      });

      await this.reconcileUacmCampaignStatus(payload.uacmCampaignId);

      this.campaignEvents?.emit(
        platformCampaign.uacmCampaign.userId,
        'campaign.status_changed',
        {
          id: payload.platformCampaignId,
          uacmCampaignId: payload.uacmCampaignId,
          platform: payload.platform,
          status: CampaignStatus.ACTIVE,
        },
      );

      // Mark idempotent only after success, so a requeued (failed) message
      // is actually retried instead of being skipped as "already processed".
      await this.idempotencyService.checkAndMarkProcessed(idempotencyKey);
    } catch (error) {
      await this.prisma.platformCampaign
        .update({
          where: { id: payload.platformCampaignId },
          data: { status: CampaignStatus.ERROR },
        })
        .catch((dbErr) => {
          this.logger.error(
            `Failed to set ERROR status for platform campaign ${payload.platformCampaignId}: ${dbErr?.message ?? dbErr}`,
          );
        });

      await this.reconcileUacmCampaignStatus(payload.uacmCampaignId);

      this.campaignEvents?.emit(
        platformCampaign.uacmCampaign.userId,
        'campaign.error',
        {
          id: payload.platformCampaignId,
          uacmCampaignId: payload.uacmCampaignId,
          platform: payload.platform,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }
  }

  private async handleCampaignUpdated(msg: any) {
    const payload = this.parsePayload(msg);

    const platformCampaign = await this.prisma.platformCampaign.findUnique({
      where: { id: payload.platformCampaignId },
      include: { uacmCampaign: true },
    });

    if (!platformCampaign || !platformCampaign.platformCampaignId) {
      this.logger.warn(
        `Skipping update for ${payload.platformCampaignId}: not found or not yet created on platform`,
      );
      return;
    }

    const connectedAccount = await this.prisma.connectedAccount.findFirst({
      where: {
        userId: platformCampaign.uacmCampaign.userId,
        platform: payload.platform,
      },
    });

    if (!connectedAccount) {
      this.logger.warn(
        `No connected account for ${payload.platform} during campaign update`,
      );
      return;
    }

    await this.enforceRateLimit(payload.platform, connectedAccount.id);

    try {
      const accessToken =
        await this.tokenVault.requireValidAccessToken(connectedAccount);
      const adapter = this.adapterFactory.getAdapter(payload.platform);

      await adapter.updateCampaign(
        {
          platformCampaignId: platformCampaign.platformCampaignId,
          name: platformCampaign.uacmCampaign.name,
          budget: platformCampaign.uacmCampaign.budget.toNumber(),
          startDate: platformCampaign.uacmCampaign.startDate,
          endDate: platformCampaign.uacmCampaign.endDate,
          platformSpecificData: platformCampaign.platformData,
        },
        accessToken,
      );

      this.logger.log(
        `Updated campaign ${platformCampaign.platformCampaignId} on ${payload.platform}`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to update campaign on ${payload.platform}: ${error?.message ?? error}`,
      );
      throw error;
    }
  }

  private async handleCampaignPaused(msg: any) {
    const payload = this.parsePayload(msg);

    const platformCampaign = await this.prisma.platformCampaign.findUnique({
      where: { id: payload.platformCampaignId },
      include: { uacmCampaign: true },
    });

    if (!platformCampaign || !platformCampaign.platformCampaignId) {
      this.logger.warn(
        `Skipping pause for ${payload.platformCampaignId}: not found or not yet created on platform`,
      );
      return;
    }

    const connectedAccount = await this.prisma.connectedAccount.findFirst({
      where: {
        userId: platformCampaign.uacmCampaign.userId,
        platform: payload.platform,
      },
    });

    if (!connectedAccount) {
      this.logger.warn(
        `No connected account for ${payload.platform} during campaign pause`,
      );
      return;
    }

    await this.enforceRateLimit(payload.platform, connectedAccount.id);

    try {
      const accessToken =
        await this.tokenVault.requireValidAccessToken(connectedAccount);
      const adapter = this.adapterFactory.getAdapter(payload.platform);

      await adapter.pauseCampaign(
        platformCampaign.platformCampaignId,
        accessToken,
        connectedAccount.platformAccountId ?? undefined,
      );

      await this.reconcileUacmCampaignStatus(payload.uacmCampaignId);

      this.logger.log(
        `Paused campaign ${platformCampaign.platformCampaignId} on ${payload.platform}`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to pause campaign on ${payload.platform}: ${error?.message ?? error}`,
      );
      await this.reconcileUacmCampaignStatus(payload.uacmCampaignId);
      throw error;
    }
  }

  private async handleCampaignResumed(msg: any) {
    const payload = this.parsePayload(msg);

    const platformCampaign = await this.prisma.platformCampaign.findUnique({
      where: { id: payload.platformCampaignId },
      include: { uacmCampaign: true },
    });

    if (!platformCampaign || !platformCampaign.platformCampaignId) {
      this.logger.warn(
        `Skipping resume for ${payload.platformCampaignId}: not found or not yet created on platform`,
      );
      return;
    }

    const connectedAccount = await this.prisma.connectedAccount.findFirst({
      where: {
        userId: platformCampaign.uacmCampaign.userId,
        platform: payload.platform,
      },
    });

    if (!connectedAccount) {
      this.logger.warn(
        `No connected account for ${payload.platform} during campaign resume`,
      );
      return;
    }

    await this.enforceRateLimit(payload.platform, connectedAccount.id);

    try {
      const accessToken =
        await this.tokenVault.requireValidAccessToken(connectedAccount);
      const adapter = this.adapterFactory.getAdapter(payload.platform);

      await adapter.resumeCampaign(
        platformCampaign.platformCampaignId,
        accessToken,
        connectedAccount.platformAccountId ?? undefined,
      );

      await this.reconcileUacmCampaignStatus(payload.uacmCampaignId);

      this.logger.log(
        `Resumed campaign ${platformCampaign.platformCampaignId} on ${payload.platform}`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to resume campaign on ${payload.platform}: ${error?.message ?? error}`,
      );
      await this.reconcileUacmCampaignStatus(payload.uacmCampaignId);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Reconciles the parent UacmCampaign status based on its child platform campaigns:
   * - ACTIVE: at least one platform campaign is ACTIVE;
   * - PAUSED: all non-ERROR platform campaigns are PAUSED;
   * - ERROR: all platform campaigns have failed;
   * - PENDING: all platform campaigns are still PENDING.
   */
  async reconcileUacmCampaignStatus(
    uacmCampaignId: string,
  ): Promise<CampaignStatus | null> {
    try {
      const uacmCampaign = await this.prisma.uacmCampaign.findUnique({
        where: { id: uacmCampaignId },
        include: { platformCampaigns: true },
      });

      if (!uacmCampaign || uacmCampaign.platformCampaigns.length === 0) {
        return null;
      }

      const statuses = uacmCampaign.platformCampaigns.map((pc) => pc.status);
      let targetStatus: CampaignStatus = uacmCampaign.status;

      if (statuses.some((s) => s === CampaignStatus.ACTIVE)) {
        targetStatus = CampaignStatus.ACTIVE;
      } else if (
        statuses.length > 0 &&
        statuses.every((s) => s === CampaignStatus.PAUSED)
      ) {
        targetStatus = CampaignStatus.PAUSED;
      } else if (
        statuses.length > 0 &&
        statuses.every((s) => s === CampaignStatus.ERROR)
      ) {
        targetStatus = CampaignStatus.ERROR;
      } else if (
        statuses.length > 0 &&
        statuses.every((s) => s === CampaignStatus.PENDING)
      ) {
        targetStatus = CampaignStatus.PENDING;
      }

      if (targetStatus !== uacmCampaign.status) {
        await this.prisma.uacmCampaign.update({
          where: { id: uacmCampaignId },
          data: { status: targetStatus },
        });

        this.logger.log(
          `Reconciled UACM campaign ${uacmCampaignId} status: ${uacmCampaign.status} → ${targetStatus}`,
        );

        this.campaignEvents?.emit(
          uacmCampaign.userId,
          'campaign.status_changed',
          {
            id: uacmCampaignId,
            uacmCampaignId,
            status: targetStatus,
          },
        );
      }

      return targetStatus;
    } catch (err: any) {
      this.logger.warn(
        `Failed to reconcile campaign status for ${uacmCampaignId}: ${err?.message ?? err}`,
      );
      return null;
    }
  }

  /**
   * Updates a platform campaign's status with state machine enforcement.
   * Silently skips invalid transitions (e.g. trying to set ERROR on an
   * already-errored campaign) instead of throwing.
   */
  private async updatePlatformCampaignStatus(
    platformCampaignId: string,
    currentStatus: CampaignStatus,
    newStatus: CampaignStatus,
    extra?: { platformCampaignId?: string },
  ): Promise<void> {
    if (!isValidTransition(currentStatus, newStatus)) {
      this.logger.warn(
        `Skipping invalid transition ${currentStatus} → ${newStatus} for ${platformCampaignId}`,
      );
      return;
    }

    await this.prisma.platformCampaign.update({
      where: { id: platformCampaignId },
      data: {
        status: newStatus,
        ...(extra?.platformCampaignId
          ? { platformCampaignId: extra.platformCampaignId }
          : {}),
      },
    });
  }

  private async enforceRateLimit(
    platform: Platform,
    accountId: string,
  ): Promise<void> {
    const rateLimitKey = `platform:${platform}:${accountId}`;
    const allowed = await this.rateLimiter.checkRateLimit(rateLimitKey, {
      tokensPerInterval: 100,
      interval: 60000,
    });
    if (!allowed) {
      throw new Error('Rate limit exceeded');
    }
  }

  private parsePayload(msg: any): CampaignCreatedPayload {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(msg.content.toString());
    } catch {
      throw new Error(
        `Malformed campaign message: ${msg.content.toString()}`,
      );
    }

    const { uacmCampaignId, platformCampaignId, platform } = raw;
    if (
      typeof uacmCampaignId !== 'string' ||
      typeof platformCampaignId !== 'string' ||
      typeof platform !== 'string' ||
      !Object.values(Platform).includes(platform as Platform)
    ) {
      throw new Error(
        'Campaign message is missing required fields or has an invalid platform',
      );
    }

    return {
      uacmCampaignId,
      platformCampaignId,
      platform: platform as Platform,
    };
  }
}
