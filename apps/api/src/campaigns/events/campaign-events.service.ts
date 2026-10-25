import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface CampaignRealtimeEvent {
  userId: string;
  eventType:
    | 'campaign.created'
    | 'campaign.updated'
    | 'campaign.status_changed'
    | 'campaign.paused'
    | 'campaign.resumed'
    | 'campaign.deleted'
    | 'campaign.error';
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Service for broadcasting real-time campaign status transitions and events
 * to authenticated clients via Server-Sent Events (SSE).
 */
@Injectable()
export class CampaignEventsService {
  private readonly logger = new Logger(CampaignEventsService.name);
  private readonly eventSubject = new Subject<CampaignRealtimeEvent>();

  /**
   * Broadcasts a campaign event to the in-memory event stream.
   */
  emit(
    userId: string,
    eventType: CampaignRealtimeEvent['eventType'],
    data: Record<string, unknown>,
  ): void {
    const payload: CampaignRealtimeEvent = {
      userId,
      eventType,
      data,
      timestamp: new Date().toISOString(),
    };

    this.logger.debug(
      `Emitting real-time event ${eventType} for user ${userId} (campaign: ${data.id || data.uacmCampaignId})`,
    );

    this.eventSubject.next(payload);
  }

  /**
   * Returns an Observable of MessageEvents filtered specifically for the given user.
   */
  getEventStream(userId: string): Observable<MessageEvent> {
    return this.eventSubject.asObservable().pipe(
      filter((event) => event.userId === userId),
      map((event) => ({
        type: event.eventType,
        data: {
          eventType: event.eventType,
          data: event.data,
          timestamp: event.timestamp,
        },
      })),
    );
  }
}
