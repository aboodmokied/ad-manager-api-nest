import { Injectable } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { AdsPlatformAdapter } from './ads-platform.adapter';
import { MetaAdapter } from './meta.adapter';
import { GoogleAdapter } from './google.adapter';
import { LinkedinAdapter } from './linkedin.adapter';
import { XAdapter } from './x.adapter';
import { SnapchatAdapter } from './snapchat.adapter';
import { TiktokAdapter } from './tiktok.adapter';

@Injectable()
export class AdapterFactory {
  private adapters: Map<Platform, AdsPlatformAdapter>;

  constructor(
    private readonly metaAdapter: MetaAdapter,
    private readonly googleAdapter: GoogleAdapter,
    private readonly linkedinAdapter: LinkedinAdapter,
    private readonly xAdapter: XAdapter,
    private readonly snapchatAdapter: SnapchatAdapter,
    private readonly tiktokAdapter: TiktokAdapter,
  ) {
    this.adapters = new Map<Platform, AdsPlatformAdapter>([
      [Platform.META, metaAdapter],
      [Platform.GOOGLE, googleAdapter],
      [Platform.LINKEDIN, linkedinAdapter],
      [Platform.X, xAdapter],
      [Platform.SNAPCHAT, snapchatAdapter],
      [Platform.TIKTOK, tiktokAdapter],
    ]);
  }

  getAdapter(platform: Platform): AdsPlatformAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`No adapter found for platform: ${platform}`);
    }
    return adapter;
  }
}

