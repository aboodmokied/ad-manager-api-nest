import { CampaignStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

/**
 * Campaign status state machine.
 *
 * Defines the legal transitions between campaign statuses and enforces
 * them before any status change. Invalid transitions are rejected with
 * a descriptive error instead of silently corrupting state.
 *
 * Transition graph:
 *
 *   PENDING  ──→ ACTIVE
 *   PENDING  ──→ ERROR
 *   ACTIVE   ──→ PAUSED
 *   ACTIVE   ──→ ERROR
 *   PAUSED   ──→ ACTIVE
 *   PAUSED   ──→ ERROR
 *   ERROR    ──→ PENDING  (retry / re-enqueue)
 *   ERROR    ──→ ACTIVE   (retry / creation success)
 */
const VALID_TRANSITIONS = new Map<CampaignStatus, Set<CampaignStatus>>([
  [
    CampaignStatus.PENDING,
    new Set<CampaignStatus>([CampaignStatus.ACTIVE, CampaignStatus.ERROR]),
  ],
  [
    CampaignStatus.ACTIVE,
    new Set<CampaignStatus>([CampaignStatus.PAUSED, CampaignStatus.ERROR]),
  ],
  [
    CampaignStatus.PAUSED,
    new Set<CampaignStatus>([CampaignStatus.ACTIVE, CampaignStatus.ERROR]),
  ],
  [
    CampaignStatus.ERROR,
    new Set<CampaignStatus>([
      CampaignStatus.PENDING,
      CampaignStatus.ACTIVE,
      CampaignStatus.ERROR,
    ]),
  ],
]);

/**
 * Returns true when transitioning from `from` to `to` is allowed.
 */
export function isValidTransition(
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS.get(from)?.has(to) ?? false;
}

/**
 * Asserts that the transition is valid and throws a descriptive
 * BadRequestException when it is not.
 */
export function assertTransition(
  from: CampaignStatus,
  to: CampaignStatus,
): void {
  if (!isValidTransition(from, to)) {
    throw new BadRequestException(
      `Invalid campaign status transition: ${from} → ${to}`,
    );
  }
}
