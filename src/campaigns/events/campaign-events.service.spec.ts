import { CampaignEventsService } from './campaign-events.service';
import { firstValueFrom, toArray, take } from 'rxjs';

describe('CampaignEventsService', () => {
  let service: CampaignEventsService;

  beforeEach(() => {
    service = new CampaignEventsService();
  });

  it('streams real-time events for matching userId only', async () => {
    const streamPromise = firstValueFrom(service.getEventStream('user-1'));

    service.emit('user-2', 'campaign.created', { id: 'other' });
    service.emit('user-1', 'campaign.created', { id: 'camp-1', name: 'Summer' });

    const received = await streamPromise;
    expect(received.type).toBe('campaign.created');
    expect((received.data as any).data.id).toBe('camp-1');
  });

  it('broadcasts status transitions properly', async () => {
    const streamPromise = firstValueFrom(service.getEventStream('user-1'));

    service.emit('user-1', 'campaign.status_changed', {
      uacmCampaignId: 'camp-1',
      status: 'ACTIVE',
    });

    const received = await streamPromise;
    expect(received.type).toBe('campaign.status_changed');
    expect((received.data as any).data.status).toBe('ACTIVE');
  });
});
