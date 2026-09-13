import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { MetaAdapter } from './meta.adapter';
import { GoogleAdapter } from './google.adapter';
import { LinkedinAdapter } from './linkedin.adapter';
import { XAdapter } from './x.adapter';
import { SnapchatAdapter } from './snapchat.adapter';
import { TiktokAdapter } from './tiktok.adapter';
import { AdapterFactory } from './adapter-factory.service';

@Module({
  imports: [AccountsModule],
  providers: [
    MetaAdapter,
    GoogleAdapter,
    LinkedinAdapter,
    XAdapter,
    SnapchatAdapter,
    TiktokAdapter,
    AdapterFactory,
  ],
  exports: [
    MetaAdapter,
    GoogleAdapter,
    LinkedinAdapter,
    XAdapter,
    SnapchatAdapter,
    TiktokAdapter,
    AdapterFactory,
  ],
})
export class AdaptersModule {}
