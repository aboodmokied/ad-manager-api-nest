import { Platform } from '../enums/platform.enum';
import { PlatformNormalizedExceptionDto } from '../adapters/exception';

export enum DomainEventType {
  CAMPAIGN_CREATED = 'campaign.created',
  CAMPAIGN_PRE_VALIDATION_PASSED = 'campaign.pre_validation_passed',
  CAMPAIGN_MEDIA_UPLOADED = 'campaign.media_uploaded',
  CAMPAIGN_PUBLISH_INITIATED = 'campaign.publish_initiated',
  PLATFORM_STEP_SUCCEEDED = 'campaign.platform_step_succeeded',
  PLATFORM_STEP_FAILED = 'campaign.platform_step_failed',
  CAMPAIGN_PARTIALLY_LIVE = 'campaign.partially_live',
  CAMPAIGN_LIVE = 'campaign.live',
  CAMPAIGN_FAILED = 'campaign.failed',
  CAMPAIGN_RETRY_REQUESTED = 'campaign.retry_requested',
}

export type SagaStep = 'MEDIA' | 'CAMPAIGN' | 'TARGETING_SET' | 'AD';

export enum SagaStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  PARTIAL_SUCCESS = 'PARTIAL_SUCCESS',
  FAILED = 'FAILED',
}

export enum SagaFailurePolicy {
  PARTIAL_LIVE = 'PARTIAL_LIVE',
  STRICT_ALL_OR_NOTHING = 'STRICT_ALL_OR_NOTHING',
}

export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
}

export interface PlatformStepCheckpoint {
  step: SagaStep;
  externalId: string;
  completedAt: string;
}

export interface SagaInstanceState {
  sagaId: string;
  campaignId: string;
  workspaceId: string;
  currentStep: string;
  targetPlatforms: Platform[];
  platformStatus: Record<Platform, string>;
  stepCheckpoints: Record<Platform, Record<SagaStep, string | undefined>>;
  status: SagaStatus;
  failurePolicy: SagaFailurePolicy;
}

export interface CampaignCreatedEventPayload {
  campaignId: string;
  workspaceId: string;
  userId: string;
  targetPlatforms: Platform[];
  idempotencyKey: string;
  createdAt: string;
}

export interface CampaignPublishInitiatedEventPayload {
  sagaId: string;
  campaignId: string;
  workspaceId: string;
  targetPlatforms: Platform[];
  idempotencyKey: string;
}

export interface PlatformPublishStepSucceededEventPayload {
  sagaId: string;
  campaignId: string;
  platform: Platform;
  step: SagaStep;
  externalId: string;
  timestamp: string;
}

export interface PlatformPublishStepFailedEventPayload {
  sagaId: string;
  campaignId: string;
  platform: Platform;
  step: SagaStep;
  error: PlatformNormalizedExceptionDto;
  timestamp: string;
}

export interface CampaignPartiallyLiveEventPayload {
  campaignId: string;
  workspaceId: string;
  successfulPlatforms: Platform[];
  failedPlatforms: {
    platform: Platform;
    error: PlatformNormalizedExceptionDto;
  }[];
  timestamp: string;
}

export interface CampaignLiveEventPayload {
  campaignId: string;
  workspaceId: string;
  platforms: Platform[];
  publishedAt: string;
}

export interface CampaignRetryRequestedEventPayload {
  campaignId: string;
  workspaceId: string;
  platformsToRetry: Platform[];
  requestedByUserId: string;
  timestamp: string;
}
