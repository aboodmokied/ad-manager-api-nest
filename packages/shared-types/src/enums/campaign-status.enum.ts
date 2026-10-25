export enum CampaignStatus {
  DRAFT = 'DRAFT',
  PRE_VALIDATING = 'PRE_VALIDATING',
  PROCESSING_MEDIA = 'PROCESSING_MEDIA',
  QUEUED_FOR_PUBLISH = 'QUEUED_FOR_PUBLISH',
  PARTIALLY_LIVE = 'PARTIALLY_LIVE',
  LIVE = 'LIVE',
  PAUSED = 'PAUSED',
  FAILED = 'FAILED',
}

export const VALID_STATUS_TRANSITIONS: Record<
  CampaignStatus,
  CampaignStatus[]
> = {
  [CampaignStatus.DRAFT]: [
    CampaignStatus.PRE_VALIDATING,
    CampaignStatus.FAILED,
  ],
  [CampaignStatus.PRE_VALIDATING]: [
    CampaignStatus.PROCESSING_MEDIA,
    CampaignStatus.DRAFT,
    CampaignStatus.FAILED,
  ],
  [CampaignStatus.PROCESSING_MEDIA]: [
    CampaignStatus.QUEUED_FOR_PUBLISH,
    CampaignStatus.FAILED,
  ],
  [CampaignStatus.QUEUED_FOR_PUBLISH]: [
    CampaignStatus.LIVE,
    CampaignStatus.PARTIALLY_LIVE,
    CampaignStatus.FAILED,
  ],
  [CampaignStatus.PARTIALLY_LIVE]: [
    CampaignStatus.QUEUED_FOR_PUBLISH,
    CampaignStatus.LIVE,
    CampaignStatus.PAUSED,
    CampaignStatus.FAILED,
  ],
  [CampaignStatus.LIVE]: [CampaignStatus.PAUSED, CampaignStatus.FAILED],
  [CampaignStatus.PAUSED]: [CampaignStatus.LIVE, CampaignStatus.FAILED],
  [CampaignStatus.FAILED]: [
    CampaignStatus.PRE_VALIDATING,
    CampaignStatus.DRAFT,
  ],
};

export function isValidStatusTransition(
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
