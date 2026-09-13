import { MockRabbitMQ } from './__mocks__/mock-rabbitmq';
import { RabbitMQService } from './rabbitmq.service';
import { ConfigService } from '@nestjs/config';

describe('MockRabbitMQ', () => {
  let mockRabbitMQ: MockRabbitMQ;

  beforeEach(() => {
    mockRabbitMQ = new MockRabbitMQ();
  });

  it('honors routing keys and only invokes handlers bound to the published routing key', async () => {
    const queueAHandler = jest.fn();
    const queueBHandler = jest.fn();

    await mockRabbitMQ.startConsume('queue_a', 'campaign.created', queueAHandler);
    await mockRabbitMQ.startConsume('queue_b', 'campaign.paused', queueBHandler);

    await mockRabbitMQ.publish('campaign.created', { campaignId: 'camp-1' });

    expect(queueAHandler).toHaveBeenCalledTimes(1);
    expect(queueBHandler).not.toHaveBeenCalled();

    const receivedMsg = queueAHandler.mock.calls[0][0];
    expect(JSON.parse(receivedMsg.content.toString())).toEqual({
      campaignId: 'camp-1',
    });

    await mockRabbitMQ.publish('campaign.paused', { campaignId: 'camp-1' });

    expect(queueAHandler).toHaveBeenCalledTimes(1);
    expect(queueBHandler).toHaveBeenCalledTimes(1);
  });
});

describe('RabbitMQService (Mock Mode)', () => {
  let service: RabbitMQService;

  beforeEach(async () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'USE_MOCK_RABBITMQ') return 'true';
        return '';
      }),
    };
    service = new RabbitMQService(configService as any);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('publishes and consumes messages using mock client when in mock mode', async () => {
    const handler = jest.fn();
    await service.consume('test_queue', 'test.event', handler);

    await service.publish('test.event', { foo: 'bar' });

    expect(handler).toHaveBeenCalledTimes(1);
    const msg = handler.mock.calls[0][0];
    expect(JSON.parse(msg.content.toString())).toEqual({ foo: 'bar' });
  });

  it('does not invoke consumer when routing key does not match', async () => {
    const handler = jest.fn();
    await service.consume('test_queue', 'order.placed', handler);

    await service.publish('order.cancelled', { id: 123 });

    expect(handler).not.toHaveBeenCalled();
  });
});
