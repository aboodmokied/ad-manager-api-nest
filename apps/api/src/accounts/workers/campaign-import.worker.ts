import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import {
  CAMPAIGN_IMPORT_EVENT,
  CAMPAIGN_IMPORT_QUEUE,
} from '../constants/accounts.constants';
import { ImportRequestPayload } from '../interfaces/accounts.interfaces';
import { CampaignImportRunner } from '../services/campaign-import.runner';

/**
 * Consumes `account.campaigns-import-requested` events and imports the
 * account's campaigns right after a successful OAuth linking.
 *
 * Failures are logged with sanitized messages and never crash the consumer:
 * the reauthorization flow already notifies the user when the token itself
 * is the problem.
 */
@Injectable()
export class CampaignImportWorker implements OnModuleInit {
  private readonly logger = new Logger(CampaignImportWorker.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly importRunner: CampaignImportRunner,
  ) {}

  async onModuleInit() {
    this.logger.log(`Consuming ${CAMPAIGN_IMPORT_QUEUE}`);
    await this.rabbitMQService.consume(
      CAMPAIGN_IMPORT_QUEUE,
      CAMPAIGN_IMPORT_EVENT,
      this.handleImportRequest.bind(this),
    );
  }

  private async handleImportRequest(msg: any): Promise<void> {
    let payload: ImportRequestPayload;
    try {
      payload = JSON.parse(msg.content.toString()) as ImportRequestPayload;
    } catch (error: any) {
      this.logger.warn(
        `Dropping malformed import event: ${error?.message ?? error}`,
      );
      return;
    }

    try {
      const result = await this.importRunner.run(payload);
      this.logger.log(
        `Imported campaigns for account ${payload.accountId}: ` +
          `imported=${result.imported} updated=${result.updated} failed=${result.failed}`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Campaign import failed for account ${payload.accountId}: ${
          error?.message ?? error
        }`,
      );
    }
  }
}
