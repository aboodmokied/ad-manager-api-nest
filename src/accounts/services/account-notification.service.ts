import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';
import { getFrontendUrl } from '../../auth/utils/app-urls.util';
import { REAUTH_REQUIRED_EVENT } from '../constants/accounts.constants';

export interface AccountNotification {
  to: string;
  subject: string;
  html: string;
}

/**
 * Notifies users when their advertising account needs reauthorization.
 *
 * - publishes an `account.reauthorization-required` event on RabbitMQ so
 *   other services/consumers can react (e.g. realtime push);
 * - sends an email with a direct re-connect action link;
 * - never throws: notifications must never break the flow that triggered
 *   them (mirrors the auth module's MailService behavior).
 */
@Injectable()
export class AccountNotificationService implements OnModuleInit {
  private readonly logger = new Logger(AccountNotificationService.name);
  private transporter: nodemailer.Transporter | null = null;
  private useMock = false;
  private captured: AccountNotification[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  onModuleInit() {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const host = this.configService.get<string>('EMAIL_HOST');
    const user = this.configService.get<string>('EMAIL_USER') ?? '';
    const pass = this.configService.get<string>('EMAIL_PASSWORD') ?? '';
    const port = Number(this.configService.get<string>('EMAIL_PORT') ?? 587);

    if (nodeEnv === 'test') {
      this.useMock = true;
      this.logger.log('Using mock mailer (test environment)');
      return;
    }
    if (!host || !user || !pass) {
      this.useMock = true;
      if (nodeEnv === 'production') {
        this.logger.error(
          'EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD are not configured - ' +
            'reauthorization emails will NOT be delivered in production!',
        );
      } else {
        this.logger.warn(
          'SMTP is not fully configured - reauthorization emails will only be logged',
        );
      }
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    this.logger.log(
      `Account notification SMTP transporter ready (${host}:${port})`,
    );
  }

  /** Sends the "reauthorization required" email and event for an account. */
  async notifyReauthorizationRequired(input: {
    accountId: string;
    userId: string;
    to: string;
    platform: Platform;
  }): Promise<void> {
    await this.publishEvent(input);
    await this.send({
      to: input.to,
      subject: `UACM - Reauthorization required for ${input.platform}`,
      html: this.buildEmailHtml(input),
    });
  }

  /** Returns captured notifications (mock mode / tests). */
  getCapturedNotifications(): AccountNotification[] {
    return this.captured;
  }

  private async publishEvent(input: {
    accountId: string;
    userId: string;
    platform: Platform;
  }): Promise<void> {
    try {
      await this.rabbitMQService.publish(REAUTH_REQUIRED_EVENT, {
        accountId: input.accountId,
        userId: input.userId,
        platform: input.platform,
        occurredAt: new Date().toISOString(),
      });
    } catch (error: any) {
      this.logger.warn(
        `Could not publish reauthorization event: ${error?.message ?? error}`,
      );
    }
  }

  private buildEmailHtml(input: {
    platform: Platform;
    accountId: string;
  }): string {
    const reconnectUrl = `${getFrontendUrl(this.configService)}/ad-accounts/reconnect?accountId=${input.accountId}&platform=${input.platform}`;
    return `
      <h2>Reauthorization required for ${input.platform}</h2>
      <p>Your ${input.platform} advertising account could not be refreshed.</p>
      <p>Until you reconnect it, the platform will not allow any campaign operations.</p>
      <p><a href="${reconnectUrl}">Re-connect my account</a></p>
      <p>If you did not expect this, you can safely ignore this email.</p>
    `;
  }

  private async send(message: AccountNotification): Promise<void> {
    if (this.useMock || !this.transporter) {
      this.captured.push(message);
      this.logger.log(
        `[mock-mail] to=${message.to} subject="${message.subject}"`,
      );
      return;
    }
    const from =
      this.configService.get<string>('MAIL_FROM') ??
      this.configService.get<string>('EMAIL_USER');
    try {
      await this.transporter.sendMail({ ...message, from });
      this.logger.log(
        `Reauthorization email sent to ${message.to} (${message.subject})`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send reauthorization email to ${message.to}: ${
          error?.message ?? error
        }`,
      );
    }
  }
}
