import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ThrottleGuard } from 'src/common/guards/throttle.guard';
import { TokenRevocationService } from '../auth/services/token-revocation.service';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './services/accounts.service';
import { OAuthConfigService } from './services/oauth-config.service';
import { OAuthStateService } from './services/oauth-state.service';
import { OAuthExchangeService } from './services/oauth-exchange.service';
import { TokenEncryptionService } from './services/token-encryption.service';
import { TokenVaultService } from './services/token-vault.service';
import { AccountNotificationService } from './services/account-notification.service';
import { TenantResolverService } from './services/tenant-resolver.service';
import { CampaignImportService } from './services/campaign-import.service';
import { CampaignImportRunner } from './services/campaign-import.runner';
import { CampaignImportWorker } from './workers/campaign-import.worker';
import { MetaConnector } from './connectors/meta-connector';
import { GoogleConnector } from './connectors/google-connector';
import { LinkedinConnector } from './connectors/linkedin-connector';
import { XConnector } from './connectors/x-connector';
import { SnapchatConnector } from './connectors/snapchat-connector';
import { TiktokConnector } from './connectors/tiktok-connector';
import { ConnectorFactory } from './connectors/connector-factory';

/**
 * Advertising account linking module (FR-10/FR-14).
 *
 * Provides the full OAuth flow (platform selection -> authorization URL ->
 * callback -> encrypted credential storage -> immediate campaign import) and
 * the connection lifecycle (connected/disconnected/token-expired/
 * reauthorization-required) with refresh handling and user notifications.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AccountsController],
  providers: [
    AccountsService,
    OAuthConfigService,
    OAuthStateService,
    OAuthExchangeService,
    TokenEncryptionService,
    TokenVaultService,
    AccountNotificationService,
    TenantResolverService,
    CampaignImportService,
    CampaignImportRunner,
    CampaignImportWorker,
    MetaConnector,
    GoogleConnector,
    LinkedinConnector,
    XConnector,
    SnapchatConnector,
    TiktokConnector,
    ConnectorFactory,
    JwtAuthGuard,
    ThrottleGuard,
    TokenRevocationService,
  ],
  exports: [TokenVaultService],
})
export class AccountsModule {}
