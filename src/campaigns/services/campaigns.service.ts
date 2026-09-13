import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';
import {
  CampaignStatus,
  PlatformCampaign,
  UacmCampaign,
} from '@prisma/client';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { IdempotencyService } from '../../common/services/idempotency.service';
import { assertTransition } from './campaign-status-machine';
import { CampaignEventsService } from '../events/campaign-events.service';
import { TenantResolverService } from '../../common/services/tenant-resolver.service';
import { TokenVaultService } from '../../accounts/services/token-vault.service';
import { AdapterFactory } from '../../adapters/adapter-factory.service';
import { UnifiedMetrics } from '../../adapters/ads-platform.adapter';
import {
  CampaignResponseDto,
  PaginatedCampaignsResponseDto,
  toCampaignResponseDto,
} from '../dto/campaign-response.dto';

/** Shape of the campaign with its platform campaigns included. */
type CampaignWithPlatforms = UacmCampaign & {
  platformCampaigns: PlatformCampaign[];
};

/** Payload published to RabbitMQ for campaign lifecycle events. */
interface CampaignEventPayload {
  uacmCampaignId: string;
  platformCampaignId: string;
  platform: string;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly idempotencyService: IdempotencyService,
    private readonly tenantResolver: TenantResolverService,
    @Optional() private readonly adapterFactory?: AdapterFactory,
    @Optional() private readonly tokenVault?: TokenVaultService,
    @Optional() private readonly campaignEvents?: CampaignEventsService,
  ) {}

  /**
   * Creates a campaign. When the client supplies an Idempotency-Key header
   * the request is deduplicated: a second call with the same key is rejected
   * with 409 instead of creating a duplicate campaign.
   */
  async create(
    userId: string,
    createCampaignDto: CreateCampaignDto,
    idempotencyKey?: string,
  ): Promise<CampaignResponseDto> {
    const key = idempotencyKey ? `http:campaigns:${idempotencyKey}` : undefined;
    if (key) {
      const alreadyProcessed =
        await this.idempotencyService.checkAndMarkProcessed(key);
      if (alreadyProcessed) {
        throw new ConflictException(
          'A campaign was already created for this Idempotency-Key.',
        );
      }
    }

    const tenantId = this.tenantResolver.resolveTenantId(userId);

    try {
      const uacmCampaign = await this.prisma.uacmCampaign.create({
        data: {
          userId,
          tenantId,
          name: createCampaignDto.name,
          budget: createCampaignDto.budget,
          startDate: new Date(createCampaignDto.startDate),
          endDate: new Date(createCampaignDto.endDate),
          status: CampaignStatus.PENDING,
          platformCampaigns: {
            create: createCampaignDto.platforms.map((config) => ({
              platform: config.platform,
              platformData: config.platformSpecificData,
              status: CampaignStatus.PENDING,
            })),
          },
        },
        include: { platformCampaigns: true },
      });

      // Emit an event for each platform campaign. A failure here must not
      // fail the HTTP request: the worker's startup sweep re-publishes
      // PENDING platform campaigns, so the row will still be processed.
      for (const platformCampaign of uacmCampaign.platformCampaigns) {
        await this.publishEvent('campaign.created', {
          uacmCampaignId: uacmCampaign.id,
          platformCampaignId: platformCampaign.id,
          platform: platformCampaign.platform,
        });
      }

      return toCampaignResponseDto(uacmCampaign);
    } catch (error) {
      // Roll back the reservation so the client can retry with the same key.
      if (key) {
        await this.idempotencyService.remove(key);
      }
      throw error;
    }
  }

  /**
   * Lists all campaigns owned by the user, ordered by creation date (newest first).
   * Scoped to the authenticated user and tenant.
   */
  async findAll(
    userId: string,
    options?: {
      status?: CampaignStatus;
      skip?: number;
      take?: number;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<PaginatedCampaignsResponseDto & { data: CampaignResponseDto[] }> {
    const tenantId = this.tenantResolver.resolveTenantId(userId);
    const where: any = {
      userId,
      OR: [{ tenantId }, { tenantId: null }],
    };
    if (options?.status) {
      where.status = options.status;
    }

    const page =
      options?.page ??
      (options?.skip !== undefined && options?.take
        ? Math.floor(options.skip / options.take) + 1
        : 1);
    const limit = options?.limit ?? options?.take ?? 50;
    const skip = options?.skip ?? (page - 1) * limit;
    const take = limit;
    const orderByField = options?.sortBy ?? 'createdAt';
    const sortOrder = options?.sortOrder ?? 'desc';

    const [data, total] = await Promise.all([
      this.prisma.uacmCampaign.findMany({
        where,
        include: { platformCampaigns: true },
        orderBy: { [orderByField]: sortOrder },
        skip,
        take,
      }),
      this.prisma.uacmCampaign.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    const mappedItems = data.map(toCampaignResponseDto);

    return {
      items: mappedItems,
      data: mappedItems,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /** Returns the campaign only when it belongs to the given user and tenant. */
  async findOne(
    userId: string,
    id: string,
  ): Promise<CampaignResponseDto | null> {
    const tenantId = this.tenantResolver.resolveTenantId(userId);
    const campaign = await this.prisma.uacmCampaign.findFirst({
      where: { id, userId, OR: [{ tenantId }, { tenantId: null }] },
      include: { platformCampaigns: true },
    });
    return campaign ? toCampaignResponseDto(campaign) : null;
  }

  /**
   * Returns a real-time event stream (SSE) for the given user.
   */
  getEventStream(userId: string) {
    if (!this.campaignEvents) {
      throw new Error('CampaignEventsService is not configured');
    }
    return this.campaignEvents.getEventStream(userId);
  }

  /**
   * Retrieves aggregated performance insights for a campaign from MetricLogs
   * and live platform adapter calls.
   */
  async getInsights(userId: string, id: string): Promise<any> {
    const campaign = await this.findOwnedOrThrow(userId, id);

    // Query recorded metric logs
    const metricLogs = await this.prisma.metricLog.findMany({
      where: { uacmCampaignId: campaign.id },
      orderBy: { date: 'desc' },
    });

    const byPlatform: Array<{
      platform: string;
      platformCampaignId: string | null;
      status: CampaignStatus;
      metrics: UnifiedMetrics;
    }> = [];

    const total = {
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      ctr: 0,
      cpc: 0,
      roas: undefined as number | undefined,
    };

    let totalConversionValue = 0;

    for (const pc of campaign.platformCampaigns) {
      let metrics: UnifiedMetrics | null = null;

      // 1. Check if recent metric logs exist for this platform campaign
      const storedLog = metricLogs.find(
        (m) => m.platformCampaignId === pc.platformCampaignId,
      );
      if (storedLog && storedLog.unifiedMetrics) {
        metrics = storedLog.unifiedMetrics as unknown as UnifiedMetrics;
      }

      // 2. Query live adapter insights if available
      if (
        !metrics &&
        pc.platformCampaignId &&
        this.adapterFactory &&
        this.tokenVault
      ) {
        try {
          const connectedAccount =
            await this.prisma.connectedAccount.findFirst({
              where: { userId, platform: pc.platform },
            });
          if (connectedAccount) {
            const token =
              await this.tokenVault.requireValidAccessToken(connectedAccount);
            const adapter = this.adapterFactory.getAdapter(pc.platform);
            metrics = await adapter.getInsights(
              pc.platformCampaignId,
              token,
              connectedAccount.platformAccountId ?? undefined,
            );
          }
        } catch (error: any) {
          this.logger.warn(
            `Could not query live insights for ${pc.platform} campaign ${pc.platformCampaignId}: ${error?.message ?? error}`,
          );
        }
      }

      const finalMetrics: UnifiedMetrics = metrics ?? {
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        ctr: 0,
        cpc: 0,
      };

      total.impressions += finalMetrics.impressions || 0;
      total.clicks += finalMetrics.clicks || 0;
      total.spend += finalMetrics.spend || 0;
      total.conversions += finalMetrics.conversions || 0;
      if (finalMetrics.roas !== undefined && finalMetrics.spend > 0) {
        totalConversionValue += finalMetrics.roas * finalMetrics.spend;
      }

      byPlatform.push({
        platform: pc.platform,
        platformCampaignId: pc.platformCampaignId,
        status: pc.status,
        metrics: finalMetrics,
      });
    }

    total.ctr =
      total.impressions > 0
        ? Math.round((total.clicks / total.impressions) * 10000) / 10000
        : 0;
    total.cpc =
      total.clicks > 0
        ? Math.round((total.spend / total.clicks) * 100) / 100
        : 0;
    total.spend = Math.round(total.spend * 100) / 100;
    if (total.spend > 0 && totalConversionValue > 0) {
      total.roas = Math.round((totalConversionValue / total.spend) * 100) / 100;
    }

    return {
      uacmCampaignId: campaign.id,
      name: campaign.name,
      status: campaign.status,
      total,
      byPlatform,
      fetchedAt: new Date(),
    };
  }

  /**
   * Updates campaign fields and optionally propagates changes to
   * platform-specific configurations. Publishes a `campaign.updated` event
   * for each platform campaign so the worker can push changes upstream.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<CampaignResponseDto> {
    const campaign = await this.findOwnedOrThrow(userId, id);

    // Build the update data for the UACM campaign.
    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.budget !== undefined) updateData.budget = dto.budget;
    if (dto.startDate !== undefined)
      updateData.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) updateData.endDate = new Date(dto.endDate);

    const updated = await this.prisma.$transaction(async (tx) => {
      const campaignRow = await tx.uacmCampaign.update({
        where: { id: campaign.id },
        data: updateData,
        include: { platformCampaigns: true },
      });

      // If platform-specific data is provided, update each matching
      // platform campaign row within the transaction.
      if (dto.platforms && dto.platforms.length > 0) {
        for (const platformUpdate of dto.platforms) {
          const platformCampaign = campaignRow.platformCampaigns.find(
            (pc) => pc.platform === platformUpdate.platform,
          );
          if (platformCampaign) {
            await tx.platformCampaign.update({
              where: { id: platformCampaign.id },
              data: { platformData: platformUpdate.platformSpecificData },
            });
          }
        }
      }

      return tx.uacmCampaign.findUnique({
        where: { id: campaign.id },
        include: { platformCampaigns: true },
      });
    });

    // Publish update events for all non-PENDING platform campaigns that
    // have been created on the platform side AFTER the transaction succeeds.
    for (const pc of updated!.platformCampaigns) {
      if (pc.platformCampaignId) {
        await this.publishEvent('campaign.updated', {
          uacmCampaignId: updated!.id,
          platformCampaignId: pc.id,
          platform: pc.platform,
        });
      }
    }

    return toCampaignResponseDto(updated!);
  }

  /**
   * Pauses a campaign: validates the state transition, updates the UACM
   * campaign and all its ACTIVE platform campaigns to PAUSED inside an
   * atomic transaction, and publishes `campaign.paused` events post-commit.
   */
  async pause(
    userId: string,
    id: string,
  ): Promise<CampaignResponseDto> {
    const campaign = await this.findOwnedOrThrow(userId, id);
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new BadRequestException(
        `Only ACTIVE campaigns can be paused. Current status: ${campaign.status}`,
      );
    }
    assertTransition(campaign.status, CampaignStatus.PAUSED);

    const { updated, eventsToPublish } = await this.prisma.$transaction(
      async (tx) => {
        await tx.uacmCampaign.update({
          where: { id: campaign.id },
          data: { status: CampaignStatus.PAUSED },
        });

        // Pause each platform campaign that is currently ACTIVE.
        const activePlatformCampaigns = campaign.platformCampaigns.filter(
          (pc) => pc.status === CampaignStatus.ACTIVE,
        );

        const events: Array<{
          routingKey: string;
          payload: CampaignEventPayload;
        }> = [];

        for (const pc of activePlatformCampaigns) {
          await tx.platformCampaign.update({
            where: { id: pc.id },
            data: { status: CampaignStatus.PAUSED },
          });
          if (pc.platformCampaignId) {
            events.push({
              routingKey: 'campaign.paused',
              payload: {
                uacmCampaignId: campaign.id,
                platformCampaignId: pc.id,
                platform: pc.platform,
              },
            });
          }
        }

        const refreshed = await tx.uacmCampaign.findUnique({
          where: { id: campaign.id },
          include: { platformCampaigns: true },
        });

        return { updated: refreshed!, eventsToPublish: events };
      },
    );

    // Publish events only AFTER transaction commits
    for (const event of eventsToPublish) {
      const published = await this.publishEvent(event.routingKey, event.payload);
      if (!published) {
        // Rollback local status to avoid desynchronization with the ad platform
        await this.prisma.$transaction(async (rollbackTx) => {
          await rollbackTx.uacmCampaign.update({
            where: { id: campaign.id },
            data: { status: campaign.status },
          });
          for (const pc of campaign.platformCampaigns) {
            await rollbackTx.platformCampaign.update({
              where: { id: pc.id },
              data: { status: pc.status },
            });
          }
        });
        throw new BadGatewayException(
          `Failed to dispatch ${event.routingKey} event to message broker for platform campaign ${event.payload.platformCampaignId}`,
        );
      }
    }

    return toCampaignResponseDto(updated);
  }

  /**
   * Resumes a paused campaign: validates the state transition, updates
   * the UACM campaign and all its PAUSED platform campaigns to ACTIVE inside
   * an atomic transaction, and publishes `campaign.resumed` events post-commit.
   */
  async resume(
    userId: string,
    id: string,
  ): Promise<CampaignResponseDto> {
    const campaign = await this.findOwnedOrThrow(userId, id);
    if (campaign.status !== CampaignStatus.PAUSED) {
      throw new BadRequestException(
        `Only PAUSED campaigns can be resumed. Current status: ${campaign.status}`,
      );
    }
    assertTransition(campaign.status, CampaignStatus.ACTIVE);

    const { updated, eventsToPublish } = await this.prisma.$transaction(
      async (tx) => {
        await tx.uacmCampaign.update({
          where: { id: campaign.id },
          data: { status: CampaignStatus.ACTIVE },
        });

        const pausedPlatformCampaigns = campaign.platformCampaigns.filter(
          (pc) => pc.status === CampaignStatus.PAUSED,
        );

        const events: Array<{
          routingKey: string;
          payload: CampaignEventPayload;
        }> = [];

        for (const pc of pausedPlatformCampaigns) {
          await tx.platformCampaign.update({
            where: { id: pc.id },
            data: { status: CampaignStatus.ACTIVE },
          });
          if (pc.platformCampaignId) {
            events.push({
              routingKey: 'campaign.resumed',
              payload: {
                uacmCampaignId: campaign.id,
                platformCampaignId: pc.id,
                platform: pc.platform,
              },
            });
          }
        }

        const refreshed = await tx.uacmCampaign.findUnique({
          where: { id: campaign.id },
          include: { platformCampaigns: true },
        });

        return { updated: refreshed!, eventsToPublish: events };
      },
    );

    // Publish events only AFTER transaction commits
    for (const event of eventsToPublish) {
      const published = await this.publishEvent(event.routingKey, event.payload);
      if (!published) {
        // Rollback local status to avoid desynchronization with the ad platform
        await this.prisma.$transaction(async (rollbackTx) => {
          await rollbackTx.uacmCampaign.update({
            where: { id: campaign.id },
            data: { status: campaign.status },
          });
          for (const pc of campaign.platformCampaigns) {
            await rollbackTx.platformCampaign.update({
              where: { id: pc.id },
              data: { status: pc.status },
            });
          }
        });
        throw new BadGatewayException(
          `Failed to dispatch ${event.routingKey} event to message broker for platform campaign ${event.payload.platformCampaignId}`,
        );
      }
    }

    return toCampaignResponseDto(updated);
  }

  /**
   * Deletes a campaign and all its related platform campaigns and metric
   * logs (cascading via Prisma relations). Returns a confirmation message.
   */
  async remove(
    userId: string,
    id: string,
  ): Promise<{ message: string }> {
    const campaign = await this.findOwnedOrThrow(userId, id);

    await this.prisma.uacmCampaign.delete({
      where: { id: campaign.id },
    });

    this.logger.log(
      `Deleted campaign ${campaign.id} (${campaign.name}) for user ${userId}`,
    );
    return { message: 'Campaign deleted successfully' };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async findOwnedOrThrow(
    userId: string,
    id: string,
  ): Promise<CampaignWithPlatforms> {
    const tenantId = this.tenantResolver.resolveTenantId(userId);
    const campaign = await this.prisma.uacmCampaign.findFirst({
      where: { id, userId, OR: [{ tenantId }, { tenantId: null }] },
      include: { platformCampaigns: true },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  private async publishEvent(
    routingKey: string,
    payload: CampaignEventPayload,
  ): Promise<boolean> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.rabbitMQService.publish(routingKey, payload);
        return true;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        }
      }
    }
    this.logger.error(
      `Could not publish ${routingKey} for ${payload.platformCampaignId} ` +
        `after 3 attempts: ${lastError instanceof Error ? lastError.message : lastError}`,
    );
    return false;
  }
}
