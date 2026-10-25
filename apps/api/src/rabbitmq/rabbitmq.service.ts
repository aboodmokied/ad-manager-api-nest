import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, {
  AmqpConnectionManager,
  ChannelWrapper,
} from 'amqp-connection-manager';
import { Channel, ConsumeMessage } from 'amqplib';

/**
 * Mock implementation of a RabbitMQ message for use in development mode
 * Mimics the structure of a real ConsumeMessage from amqplib with minimal functionality
 */
class MockConsumeMessage {
  /**
   * Creates a new MockConsumeMessage
   * @param content The raw message content as a Buffer (will contain JSON string)
   */
  constructor(public content: Buffer) {}

  /**
   * Helper method to convert the Buffer content to a string
   * @returns String representation of the message content
   */
  toString() {
    return this.content.toString();
  }
}

/**
 * Mock implementation of a RabbitMQ service for development when no real broker is available
 * Stores queue handlers in memory and calls them immediately when messages are published
 */
class MockRabbitMQ {
  /**
   * In-memory store of queue names and their respective bindings (routing key + handler)
   */
  private queues = new Map<
    string,
    { routingKey: string; handler: (msg: any) => Promise<void> }
  >();

  /**
   * Publishes a message only to queues bound to the given routing key
   * @param routingKey The topic/routing key to publish to
   * @param message The message to send (will be JSON-stringified)
   */
  async publish(routingKey: string, message: any) {
    console.log(
      `[Mock RabbitMQ] Publishing message to routing key: ${routingKey}`,
      message,
    );
    for (const [, binding] of this.queues) {
      if (binding.routingKey !== routingKey) continue;
      await binding.handler(
        new MockConsumeMessage(Buffer.from(JSON.stringify(message))),
      );
    }
  }

  /**
   * Registers a consumer handler for a given queue and routing key in mock mode
   * @param queueName The name of the queue to listen to
   * @param routingKey The routing key/topic to bind the queue to
   * @param handler The async function to execute when a message arrives
   */
  async startConsume(
    queueName: string,
    routingKey: string,
    handler: (msg: any) => Promise<void>,
  ) {
    console.log(
      `[Mock RabbitMQ] Consuming from queue: ${queueName}, routing key: ${routingKey}`,
    );
    this.queues.set(queueName, { routingKey, handler });
  }

  /**
   * Mock close function that does nothing (for interface consistency)
   */
  async close() {}
}

/**
 * Service for managing interactions with RabbitMQ (or a mock alternative in development)
 * Handles connection management, message publishing, and consumer registration
 * Implements Nest's lifecycle hooks to properly initialize and clean up resources
 */
@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);

  /**
   * The active AMQP connection manager instance (null if using mock)
   * AmqpConnectionManager provides automatic reconnection capabilities
   */
  private connection: AmqpConnectionManager | null = null;

  /**
   * The active channel wrapper instance (null if using mock)
   * ChannelWrapper simplifies channel management and re-establishment
   */
  private channel: ChannelWrapper | null = null;

  /**
   * The mock RabbitMQ instance (only present in development/mock mode)
   */
  private mock: MockRabbitMQ | null = null;

  /**
   * Flag indicating whether we're currently using the mock implementation
   */
  private useMock = false;

  /**
   * The name of the topic exchange used by the Unified Ad Campaign Manager
   * All messages are published to this exchange and routed to appropriate queues
   */
  private readonly exchangeName = 'uacm_events';

  /**
   * Resolves once the connection/channel (or mock) has been set up.
   * Consumers and publishers await this so they never race the
   * onModuleInit() lifecycle hook, regardless of provider init order.
   */
  private initPromise: Promise<void> | null = null;

  /**
   * Creates a new instance of RabbitMQService
   * @param configService Nest's ConfigService to access environment variables
   */
  constructor(private readonly configService: ConfigService) {}

  /**
   * Lifecycle hook executed automatically when the Nest module is initialized
   * Decides whether to use real RabbitMQ or mock, and sets up the connection/channel
   */
  async onModuleInit() {
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  /**
   * Ensures onModuleInit has completed before publish/consume are used.
   * Makes callers safe even when their own onModuleInit hook runs earlier.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  private async initialize() {
    // Get RABBITMQ_URL from environment variables (if provided)
    const rabbitUrl = this.configService.get<string>('RABBITMQ_URL');
    // Connect to a real broker whenever a URL is configured (including development,
    // e.g. via docker compose). Fall back to the mock only in tests, when explicitly
    // requested, or when no URL is provided.
    const useMock =
      this.configService.get<string>('NODE_ENV') === 'test' ||
      this.configService.get<string>('USE_MOCK_RABBITMQ') === 'true' ||
      !rabbitUrl;

    if (useMock) {
      this.useMock = true;
      this.mock = new MockRabbitMQ();
      console.log(
        'Using mock RabbitMQ client (development mode or no RABBITMQ_URL provided)',
      );
    } else {
      // Step 1: Establish a connection to RabbitMQ using the provided URL
      this.connection = amqp.connect([rabbitUrl]);

      // Step 2: Create a channel wrapper with initial setup function
      // ChannelWrapper automatically re-creates channels if the connection drops
      this.channel = this.connection.createChannel({
        json: false, // We'll handle JSON serialization/deserialization ourselves
        // The setup function runs every time a new channel is created (initial connection or reconnection)
        setup: async (channel: Channel) => {
          // Step 3: Declare the exchange (idempotent - safe to call even if exchange exists)
          // 'topic' type: messages are routed to queues based on a pattern matching routing keys
          // { durable: true }: Exchange survives broker restart
          await channel.assertExchange(this.exchangeName, 'topic', {
            durable: true,
          });
        },
      });
    }
  }

  /**
   * Lifecycle hook executed automatically when the Nest module is destroyed
   * Cleans up the RabbitMQ connection and channel (if not in mock mode)
   */
  async onModuleDestroy() {
    // Only clean up real RabbitMQ resources, not the mock
    if (!this.useMock && this.channel && this.connection) {
      // Close the channel first, then the connection
      await this.channel.close();
      await this.connection.close();
    }
  }

  /**
   * Publishes a message to the configured RabbitMQ exchange with the specified routing key
   * @param routingKey The topic/routing key to use for message distribution
   * @param message The message payload (will be JSON-stringified)
   */
  async publish(routingKey: string, message: any) {
    await this.ensureInitialized();
    if (this.useMock && this.mock) {
      // If using mock, delegate to mock.publish()
      await this.mock.publish(routingKey, message);
    } else if (this.channel) {
      // For real RabbitMQ:
      // 1. Convert message to JSON string and then to Buffer
      // 2. Set persistent: true to ensure message survives broker restart
      await this.channel.publish(
        this.exchangeName,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        { persistent: true },
      );
    }
  }

  /**
   * Registers a consumer function to listen for messages on the specified queue
   * @param queueName The name of the queue to consume from
   * @param routingKey The routing key/topic pattern to bind the queue to
   * @param handler The async function to execute for each incoming message
   * @param options.maxRetries Maximum delivery attempts before a message is
   *   sent to the DLQ (or dropped when no DLQ is configured). Defaults to 3.
   * @param options.dlq Queue name for failed messages. When provided, messages
   *   that exhaust their retries are published there with the original routing
   *   key and error attached as headers, then nacked without requeue.
   */
  async consume(
    queueName: string,
    routingKey: string,
    handler: (msg: ConsumeMessage) => Promise<void>,
    options: { maxRetries?: number; dlq?: string } = {},
  ) {
    await this.ensureInitialized();
    if (this.useMock && this.mock) {
      // If using mock, delegate to mock.startConsume()
      await this.mock.startConsume(queueName, routingKey, handler);
    } else if (this.channel) {
      const maxRetries = options.maxRetries ?? 3;
      // For real RabbitMQ, use addSetup() to run queue/bind/consume setup
      // This ensures the setup runs every time a channel is recreated
      await this.channel.addSetup(async (channel: Channel) => {
        // Step 1: Declare the queue (idempotent - safe to call even if queue exists)
        // { durable: true }: Queue survives broker restart
        await channel.assertQueue(queueName, { durable: true });

        // Step 2: Bind the queue to our exchange using the specified routing key
        // This tells the exchange which messages to send to this queue
        await channel.bindQueue(queueName, this.exchangeName, routingKey);

        // Step 3: Declare the dead-letter queue when configured and bind it
        // to the exchange so published DLQ messages actually route somewhere.
        if (options.dlq) {
          await channel.assertQueue(options.dlq, { durable: true });
          await channel.bindQueue(options.dlq, this.exchangeName, options.dlq);
        }

        // Step 4: Start consuming messages from the queue
        await channel.consume(queueName, async (msg) => {
          if (msg) {
            try {
              // First, pass the message to our handler function
              await handler(msg);
              // If handler succeeds, acknowledge (ack) the message so RabbitMQ deletes it
              channel.ack(msg);
            } catch (error) {
              const attempts = this.deliveryAttempts(msg);
              const isTerminal = this.isTerminalError(error);

              if (attempts >= maxRetries || isTerminal) {
                // Retry budget exhausted or non-retryable error: route to DLQ (if configured) and
                // nack without requeue so the message is not redelivered forever (poison message handling).
                const reason = isTerminal
                  ? 'non-retryable terminal error'
                  : `retry budget exhausted (${attempts}/${maxRetries} attempts)`;

                this.logger.error(
                  `Message on queue "${queueName}" failed (${reason}); routing to DLQ: ${options.dlq ?? '(none, dropping)'}`,
                  error instanceof Error ? error.stack : String(error),
                );

                if (options.dlq) {
                  channel.publish(this.exchangeName, options.dlq, msg.content, {
                    persistent: true,
                    headers: {
                      'x-original-routing-key': routingKey,
                      'x-original-error':
                        error instanceof Error ? error.message : String(error),
                      'x-retry-count': attempts,
                    },
                  });
                }
                channel.nack(msg, false, false);
              } else {
                // Transient failure: republish with incremented retry count and ack original message
                const nextAttempt = attempts + 1;
                this.logger.warn(
                  `Message on queue "${queueName}" failed ` +
                    `(attempt ${attempts}/${maxRetries}); retrying (${nextAttempt}/${maxRetries}): ` +
                    `${error instanceof Error ? error.message : String(error)}`,
                );

                channel.publish(this.exchangeName, routingKey, msg.content, {
                  persistent: true,
                  headers: {
                    ...(msg.properties.headers ?? {}),
                    'x-retry-count': nextAttempt,
                  },
                });
                channel.ack(msg);
              }
            }
          }
        });
      });
    }
  }

  /**
   * Computes how many times a message has been delivered, checking our
   * custom x-retry-count header first, followed by broker-managed x-death.
   * First delivery counts as attempt 1.
   */
  private deliveryAttempts(msg: ConsumeMessage): number {
    const customCount = msg.properties.headers?.['x-retry-count'];
    if (typeof customCount === 'number') {
      return customCount;
    }
    const death = msg.properties.headers?.['x-death'];
    if (Array.isArray(death) && death.length > 0) {
      const count = (death[0] as { count?: unknown } | null)?.count;
      if (typeof count === 'number') {
        return count + 1;
      }
    }
    return 1;
  }

  /**
   * Determines whether an error is a non-retryable business logic error
   * (e.g. missing connected account or missing entity) where retrying
   * immediately without user intervention will never succeed.
   */
  private isTerminalError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('no connected account') ||
        msg.includes('not found') ||
        msg.includes('invalid argument') ||
        msg.includes('cannot be')
      );
    }
    return false;
  }
}
