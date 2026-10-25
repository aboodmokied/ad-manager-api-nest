import {
  CampaignStatus,
  VALID_STATUS_TRANSITIONS,
  isValidStatusTransition,
} from '../index';

describe('Campaign Status Lifecycle & Transitions', () => {
  it('contains exactly the 8 required lifecycle states', () => {
    const states = Object.values(CampaignStatus);
    expect(states).toHaveLength(8);
    expect(states).toContain(CampaignStatus.DRAFT);
    expect(states).toContain(CampaignStatus.PRE_VALIDATING);
    expect(states).toContain(CampaignStatus.PROCESSING_MEDIA);
    expect(states).toContain(CampaignStatus.QUEUED_FOR_PUBLISH);
    expect(states).toContain(CampaignStatus.PARTIALLY_LIVE);
    expect(states).toContain(CampaignStatus.LIVE);
    expect(states).toContain(CampaignStatus.PAUSED);
    expect(states).toContain(CampaignStatus.FAILED);
  });

  describe('VALID_STATUS_TRANSITIONS map', () => {
    it('defines transitions for all 8 states', () => {
      for (const status of Object.values(CampaignStatus)) {
        expect(VALID_STATUS_TRANSITIONS[status]).toBeDefined();
        expect(Array.isArray(VALID_STATUS_TRANSITIONS[status])).toBe(true);
      }
    });

    it('allows DRAFT to transition to PRE_VALIDATING and FAILED', () => {
      expect(VALID_STATUS_TRANSITIONS[CampaignStatus.DRAFT]).toEqual([
        CampaignStatus.PRE_VALIDATING,
        CampaignStatus.FAILED,
      ]);
    });

    it('allows PRE_VALIDATING to transition to PROCESSING_MEDIA, DRAFT, and FAILED', () => {
      expect(VALID_STATUS_TRANSITIONS[CampaignStatus.PRE_VALIDATING]).toEqual([
        CampaignStatus.PROCESSING_MEDIA,
        CampaignStatus.DRAFT,
        CampaignStatus.FAILED,
      ]);
    });

    it('allows PROCESSING_MEDIA to transition to QUEUED_FOR_PUBLISH and FAILED', () => {
      expect(VALID_STATUS_TRANSITIONS[CampaignStatus.PROCESSING_MEDIA]).toEqual(
        [CampaignStatus.QUEUED_FOR_PUBLISH, CampaignStatus.FAILED],
      );
    });

    it('allows QUEUED_FOR_PUBLISH to transition to LIVE, PARTIALLY_LIVE, and FAILED', () => {
      expect(
        VALID_STATUS_TRANSITIONS[CampaignStatus.QUEUED_FOR_PUBLISH],
      ).toEqual([
        CampaignStatus.LIVE,
        CampaignStatus.PARTIALLY_LIVE,
        CampaignStatus.FAILED,
      ]);
    });

    it('allows PARTIALLY_LIVE to transition to QUEUED_FOR_PUBLISH, LIVE, PAUSED, and FAILED', () => {
      expect(VALID_STATUS_TRANSITIONS[CampaignStatus.PARTIALLY_LIVE]).toEqual([
        CampaignStatus.QUEUED_FOR_PUBLISH,
        CampaignStatus.LIVE,
        CampaignStatus.PAUSED,
        CampaignStatus.FAILED,
      ]);
    });

    it('allows LIVE to transition to PAUSED and FAILED', () => {
      expect(VALID_STATUS_TRANSITIONS[CampaignStatus.LIVE]).toEqual([
        CampaignStatus.PAUSED,
        CampaignStatus.FAILED,
      ]);
    });

    it('allows PAUSED to transition to LIVE and FAILED', () => {
      expect(VALID_STATUS_TRANSITIONS[CampaignStatus.PAUSED]).toEqual([
        CampaignStatus.LIVE,
        CampaignStatus.FAILED,
      ]);
    });

    it('allows FAILED to transition to PRE_VALIDATING and DRAFT', () => {
      expect(VALID_STATUS_TRANSITIONS[CampaignStatus.FAILED]).toEqual([
        CampaignStatus.PRE_VALIDATING,
        CampaignStatus.DRAFT,
      ]);
    });
  });

  describe('isValidStatusTransition helper', () => {
    it('returns true for legitimate lifecycle progressions', () => {
      expect(
        isValidStatusTransition(
          CampaignStatus.DRAFT,
          CampaignStatus.PRE_VALIDATING,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          CampaignStatus.PRE_VALIDATING,
          CampaignStatus.PROCESSING_MEDIA,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          CampaignStatus.PROCESSING_MEDIA,
          CampaignStatus.QUEUED_FOR_PUBLISH,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          CampaignStatus.QUEUED_FOR_PUBLISH,
          CampaignStatus.PARTIALLY_LIVE,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          CampaignStatus.QUEUED_FOR_PUBLISH,
          CampaignStatus.LIVE,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          CampaignStatus.PARTIALLY_LIVE,
          CampaignStatus.LIVE,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(CampaignStatus.LIVE, CampaignStatus.PAUSED),
      ).toBe(true);
      expect(
        isValidStatusTransition(CampaignStatus.PAUSED, CampaignStatus.LIVE),
      ).toBe(true);
    });

    it('returns false for illegal shortcut transitions', () => {
      // Cannot jump from DRAFT directly to LIVE
      expect(
        isValidStatusTransition(CampaignStatus.DRAFT, CampaignStatus.LIVE),
      ).toBe(false);
      // Cannot jump from DRAFT directly to QUEUED_FOR_PUBLISH
      expect(
        isValidStatusTransition(
          CampaignStatus.DRAFT,
          CampaignStatus.QUEUED_FOR_PUBLISH,
        ),
      ).toBe(false);
      // Cannot jump from LIVE back to DRAFT
      expect(
        isValidStatusTransition(CampaignStatus.LIVE, CampaignStatus.DRAFT),
      ).toBe(false);
      // Cannot jump from PROCESSING_MEDIA directly to LIVE
      expect(
        isValidStatusTransition(
          CampaignStatus.PROCESSING_MEDIA,
          CampaignStatus.LIVE,
        ),
      ).toBe(false);
      // Self-transition is not listed
      expect(
        isValidStatusTransition(CampaignStatus.LIVE, CampaignStatus.LIVE),
      ).toBe(false);
      // Non-existent status
      expect(
        isValidStatusTransition(
          'UNKNOWN_STATUS' as CampaignStatus,
          CampaignStatus.LIVE,
        ),
      ).toBe(false);
    });
  });
});
