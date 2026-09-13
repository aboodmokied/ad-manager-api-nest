/**
 * Mock implementation of a RabbitMQ message for use in development mode
 * Mimics the structure of a real ConsumeMessage from amqplib with minimal functionality
 */
export class MockConsumeMessage {
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
export class MockRabbitMQ {
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
