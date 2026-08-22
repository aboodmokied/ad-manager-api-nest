import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdapterFactory } from '../adapters/adapter-factory.service';
import { RateLimiterService } from '../common/rate-limiter.service';
import { IdempotencyService } from '../common/idempotency.service';
import { TokenVaultService } from '../accounts/services/token-vault.service';
import { CampaignStatus, Platform } from '@prisma/client';

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
  ) {}

  async onModuleInit() {
    this.logger.log('Consuming campaign_created_queue');
    await this.rabbitMQService.consume(
      'campaign_created_queue',
      'campaign.created',
      this.handleCampaignCreated.bind(this),
      { maxRetries: 5, dlq: 'campaign_created_dlq' },
    );
    await this.republishPendingCampaigns(false);
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

    for (const platformCampaign of pending) {
      await this.rabbitMQService.publish('campaign.created', {
        uacmCampaignId: platformCampaign.uacmCampaignId,
        platformCampaignId: platformCampaign.id,
        platform: platformCampaign.platform,
      });
    }
  }

  private async handleCampaignCreated(msg: any) {
    const payload = this.parsePayload(msg);

    const idempotencyKey = `campaign:${payload.platformCampaignId}`;

    // Skip work already completed (e.g. duplicate delivery after a crash).
    // Read-only on purpose: a failed attempt must NOT be marked here,
    // otherwise the requeued message would be skipped as "already processed".
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
      await this.prisma.platformCampaign.update({
        where: { id: payload.platformCampaignId },
        data: { status: CampaignStatus.ERROR },
      });
      throw new Error(`No connected account for platform ${payload.platform}`);
    }

    // Check rate limit
    const rateLimitKey = `platform:${payload.platform}:${connectedAccount.id}`;
    const rateLimitAllowed = await this.rateLimiter.checkRateLimit(
      rateLimitKey,
      {
        tokensPerInterval: 100, // Example: 100 requests per minute
        interval: 60000,
      },
    );

    if (!rateLimitAllowed) {
      // Requeue the message to be processed later
      throw new Error('Rate limit exceeded');
    }

    // Get adapter and create campaign on platform
    try {
      const accessToken =
        await this.tokenVault.requireValidAccessToken(connectedAccount);
      const adapter = this.adapterFactory.getAdapter(payload.platform);
      const platformCampaignExternalId = await adapter.createCampaign(
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

      // Update status to active
      await this.prisma.platformCampaign.update({
        where: { id: payload.platformCampaignId },
        data: {
          status: CampaignStatus.ACTIVE,
          platformCampaignId: platformCampaignExternalId,
        },
      });

      // Mark idempotent only after success, so a requeued (failed) message
      // is actually retried instead of being skipped as "already processed".
      await this.idempotencyService.checkAndMarkProcessed(idempotencyKey);
    } catch (error) {
      await this.prisma.platformCampaign.update({
        where: { id: payload.platformCampaignId },
        data: { status: CampaignStatus.ERROR },
      });
      throw error;
    }
  }

  private parsePayload(msg: any): CampaignCreatedPayload {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(msg.content.toString());
    } catch {
      throw new Error(
        `Malformed campaign.created message: ${msg.content.toString()}`,
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
        'campaign.created message is missing required fields or has an invalid platform',
      );
    }

    return {
      uacmCampaignId,
      platformCampaignId,
      platform: platform as Platform,
    };
  }
}
