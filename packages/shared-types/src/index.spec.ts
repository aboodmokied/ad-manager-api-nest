import * as SharedTypes from './index';

describe('Root Package Exports', () => {
  it('exports all canonical financial precision tools', () => {
    expect(SharedTypes.dollarsToMicros).toBeDefined();
    expect(SharedTypes.microsToCents).toBeDefined();
    expect(SharedTypes.centsToMicros).toBeDefined();
    expect(SharedTypes.formatMicros).toBeDefined();
    expect(SharedTypes.MICROS_MULTIPLIER).toBe(1_000_000n);
    expect(SharedTypes.CENTS_MULTIPLIER).toBe(10_000n);
    expect(SharedTypes.CurrencyCode).toBeDefined();
  });

  it('exports all enums and status transitions', () => {
    expect(SharedTypes.Platform).toBeDefined();
    expect(SharedTypes.CampaignStatus).toBeDefined();
    expect(SharedTypes.VALID_STATUS_TRANSITIONS).toBeDefined();
    expect(SharedTypes.isValidStatusTransition).toBeDefined();
    expect(SharedTypes.WorkspaceRole).toBeDefined();
    expect(SharedTypes.ConnectedAccountStatus).toBeDefined();
    expect(SharedTypes.PlatformExecutionStatus).toBeDefined();
  });

  it('exports all 3-tier models and enums', () => {
    expect(SharedTypes.UnifiedCampaignObjective).toBeDefined();
    expect(SharedTypes.UnifiedBidStrategy).toBeDefined();
    expect(SharedTypes.UnifiedCallToAction).toBeDefined();
  });

  it('exports Meta and Google Ads Zod schemas', () => {
    expect(SharedTypes.MetaCampaignOverrideSchema).toBeDefined();
    expect(SharedTypes.MetaTargetingSetOverrideSchema).toBeDefined();
    expect(SharedTypes.MetaCreativeAdOverrideSchema).toBeDefined();
    expect(SharedTypes.GoogleCampaignOverrideSchema).toBeDefined();
    expect(SharedTypes.GoogleTargetingSetOverrideSchema).toBeDefined();
    expect(SharedTypes.GoogleCreativeAdOverrideSchema).toBeDefined();
  });

  it('exports adapter contracts and normalized exceptions', () => {
    expect(SharedTypes.PlatformNormalizedException).toBeDefined();
  });

  it('exports Saga and Outbox domain event definitions', () => {
    expect(SharedTypes.DomainEventType).toBeDefined();
    expect(SharedTypes.SagaStatus).toBeDefined();
    expect(SharedTypes.SagaFailurePolicy).toBeDefined();
    expect(SharedTypes.OutboxStatus).toBeDefined();
  });

  it('exports Workspace DTOs and Zod schemas', () => {
    expect(SharedTypes.CreateWorkspaceSchema).toBeDefined();
    expect(SharedTypes.UpdateWorkspaceSchema).toBeDefined();
    expect(SharedTypes.AddWorkspaceMemberSchema).toBeDefined();
    expect(SharedTypes.UpdateMemberRoleSchema).toBeDefined();
  });
});
