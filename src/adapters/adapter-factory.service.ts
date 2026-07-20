import { Injectable } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { AdsPlatformAdapter } from './ads-platform.adapter';
import { MetaAdapter } from './meta.adapter';
import { GoogleAdapter } from './google.adapter';

@Injectable()
export class AdapterFactory {
  private adapters: Map<Platform, AdsPlatformAdapter>;

  constructor(
    private readonly metaAdapter: MetaAdapter,
    private readonly googleAdapter: GoogleAdapter,
  ) {
    this.adapters = new Map<Platform, AdsPlatformAdapter>([
      [Platform.META, metaAdapter],
      [Platform.GOOGLE, googleAdapter],
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
