import {
  DomainEventType,
  SagaStatus,
  SagaFailurePolicy,
  OutboxStatus,
  Platform,
  CampaignCreatedEventPayload,
  CampaignPublishInitiatedEventPayload,
  PlatformPublishStepSucceededEventPayload,
  PlatformPublishStepFailedEventPayload,
  CampaignPartiallyLiveEventPayload,
  CampaignLiveEventPayload,
  CampaignRetryRequestedEventPayload,
  PlatformStepCheckpoint,
  SagaInstanceState,
} from '../index';

describe('Saga & Outbox Domain Events', () => {
  it('defines all required DomainEventType values', () => {
    expect(DomainEventType.CAMPAIGN_CREATED).toBe('campaign.created');
    expect(DomainEventType.CAMPAIGN_PRE_VALIDATION_PASSED).toBe(
      'campaign.pre_validation_passed',
    );
    expect(DomainEventType.CAMPAIGN_MEDIA_UPLOADED).toBe(
      'campaign.media_uploaded',
    );
    expect(DomainEventType.CAMPAIGN_PUBLISH_INITIATED).toBe(
      'campaign.publish_initiated',
    );
    expect(DomainEventType.PLATFORM_STEP_SUCCEEDED).toBe(
      'campaign.platform_step_succeeded',
    );
    expect(DomainEventType.PLATFORM_STEP_FAILED).toBe(
      'campaign.platform_step_failed',
    );
    expect(DomainEventType.CAMPAIGN_PARTIALLY_LIVE).toBe(
      'campaign.partially_live',
    );
    expect(DomainEventType.CAMPAIGN_LIVE).toBe('campaign.live');
    expect(DomainEventType.CAMPAIGN_FAILED).toBe('campaign.failed');
    expect(DomainEventType.CAMPAIGN_RETRY_REQUESTED).toBe(
      'campaign.retry_requested',
    );
  });

  it('defines all SagaStatus and SagaFailurePolicy values', () => {
    expect(SagaStatus.IN_PROGRESS).toBe('IN_PROGRESS');
    expect(SagaStatus.COMPLETED).toBe('COMPLETED');
    expect(SagaStatus.PARTIAL_SUCCESS).toBe('PARTIAL_SUCCESS');
    expect(SagaStatus.FAILED).toBe('FAILED');

    expect(SagaFailurePolicy.PARTIAL_LIVE).toBe('PARTIAL_LIVE');
    expect(SagaFailurePolicy.STRICT_ALL_OR_NOTHING).toBe(
      'STRICT_ALL_OR_NOTHING',
    );

    expect(OutboxStatus.PENDING).toBe('PENDING');
    expect(OutboxStatus.PROCESSING).toBe('PROCESSING');
    expect(OutboxStatus.PUBLISHED).toBe('PUBLISHED');
    expect(OutboxStatus.FAILED).toBe('FAILED');
  });

  it('verifies type structures for domain event payloads', () => {
    const createdPayload: CampaignCreatedEventPayload = {
      campaignId: 'cmp_123',
      workspaceId: 'wsp_456',
      userId: 'usr_789',
      targetPlatforms: [Platform.META, Platform.GOOGLE],
      idempotencyKey: 'idemp_abc123',
      createdAt: new Date().toISOString(),
    };
    expect(createdPayload.campaignId).toBe('cmp_123');

    const publishInitiated: CampaignPublishInitiatedEventPayload = {
      sagaId: 'saga_001',
      campaignId: 'cmp_123',
      workspaceId: 'wsp_456',
      targetPlatforms: [Platform.META, Platform.GOOGLE],
      idempotencyKey: 'idemp_abc123',
    };
    expect(publishInitiated.sagaId).toBe('saga_001');

    const stepSucceeded: PlatformPublishStepSucceededEventPayload = {
      sagaId: 'saga_001',
      campaignId: 'cmp_123',
      platform: Platform.META,
      step: 'CAMPAIGN',
      externalId: 'act_meta_cmp_999',
      timestamp: new Date().toISOString(),
    };
    expect(stepSucceeded.step).toBe('CAMPAIGN');

    const stepFailed: PlatformPublishStepFailedEventPayload = {
      sagaId: 'saga_001',
      campaignId: 'cmp_123',
      platform: Platform.GOOGLE,
      step: 'AD',
      error: {
        platform: Platform.GOOGLE,
        errorCategory: 'VALIDATION_ERROR',
        isRetryable: false,
        humanReadableMessageAr: 'مخالفة لسياسات إعلانات جوجل',
        rawPlatformError: {},
      },
      timestamp: new Date().toISOString(),
    };
    expect(stepFailed.error.errorCategory).toBe('VALIDATION_ERROR');

    const partiallyLive: CampaignPartiallyLiveEventPayload = {
      campaignId: 'cmp_123',
      workspaceId: 'wsp_456',
      successfulPlatforms: [Platform.META],
      failedPlatforms: [
        {
          platform: Platform.GOOGLE,
          error: stepFailed.error,
        },
      ],
      timestamp: new Date().toISOString(),
    };
    expect(partiallyLive.successfulPlatforms).toContain(Platform.META);
    expect(partiallyLive.failedPlatforms).toHaveLength(1);

    const livePayload: CampaignLiveEventPayload = {
      campaignId: 'cmp_123',
      workspaceId: 'wsp_456',
      platforms: [Platform.META, Platform.GOOGLE],
      publishedAt: new Date().toISOString(),
    };
    expect(livePayload.platforms).toHaveLength(2);

    const retryPayload: CampaignRetryRequestedEventPayload = {
      campaignId: 'cmp_123',
      workspaceId: 'wsp_456',
      platformsToRetry: [Platform.GOOGLE],
      requestedByUserId: 'usr_789',
      timestamp: new Date().toISOString(),
    };
    expect(retryPayload.platformsToRetry).toContain(Platform.GOOGLE);
  });

  it('verifies step checkpointing and saga instance models', () => {
    const checkpoint: PlatformStepCheckpoint = {
      step: 'MEDIA',
      externalId: 'media_minio_hash123',
      completedAt: new Date().toISOString(),
    };
    expect(checkpoint.step).toBe('MEDIA');

    const sagaInstance: SagaInstanceState = {
      sagaId: 'saga_001',
      campaignId: 'cmp_123',
      workspaceId: 'wsp_456',
      currentStep: 'TARGETING_SET',
      targetPlatforms: [Platform.META, Platform.GOOGLE],
      platformStatus: {
        [Platform.META]: 'LIVE',
        [Platform.GOOGLE]: 'IN_PROGRESS',
        [Platform.LINKEDIN]: 'PENDING',
        [Platform.X]: 'PENDING',
        [Platform.SNAPCHAT]: 'PENDING',
        [Platform.TIKTOK]: 'PENDING',
      },
      stepCheckpoints: {
        [Platform.META]: {
          MEDIA: 'media_meta_1',
          CAMPAIGN: 'meta_cmp_1',
          TARGETING_SET: 'meta_adset_1',
          AD: 'meta_ad_1',
        },
        [Platform.GOOGLE]: {
          MEDIA: 'media_goog_1',
          CAMPAIGN: 'goog_cmp_1',
          TARGETING_SET: undefined,
          AD: undefined,
        },
        [Platform.LINKEDIN]: {
          MEDIA: undefined,
          CAMPAIGN: undefined,
          TARGETING_SET: undefined,
          AD: undefined,
        },
        [Platform.X]: {
          MEDIA: undefined,
          CAMPAIGN: undefined,
          TARGETING_SET: undefined,
          AD: undefined,
        },
        [Platform.SNAPCHAT]: {
          MEDIA: undefined,
          CAMPAIGN: undefined,
          TARGETING_SET: undefined,
          AD: undefined,
        },
        [Platform.TIKTOK]: {
          MEDIA: undefined,
          CAMPAIGN: undefined,
          TARGETING_SET: undefined,
          AD: undefined,
        },
      },
      status: SagaStatus.IN_PROGRESS,
      failurePolicy: SagaFailurePolicy.PARTIAL_LIVE,
    };
    expect(sagaInstance.failurePolicy).toBe(SagaFailurePolicy.PARTIAL_LIVE);
  });
});
