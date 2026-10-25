import { Injectable, NotFoundException } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { AdAccountConnector } from './ad-account-connector.interface';
import { MetaConnector } from './meta-connector';
import { GoogleConnector } from './google-connector';
import { LinkedinConnector } from './linkedin-connector';
import { XConnector } from './x-connector';
import { SnapchatConnector } from './snapchat-connector';
import { TiktokConnector } from './tiktok-connector';

/**
 * Resolves the connector implementation for a platform.
 * Add a new advertising platform by registering its connector here.
 */
@Injectable()
export class ConnectorFactory {
  private readonly connectors: Map<Platform, AdAccountConnector>;

  constructor(
    private readonly metaConnector: MetaConnector,
    private readonly googleConnector: GoogleConnector,
    private readonly linkedinConnector: LinkedinConnector,
    private readonly xConnector: XConnector,
    private readonly snapchatConnector: SnapchatConnector,
    private readonly tiktokConnector: TiktokConnector,
  ) {
    this.connectors = new Map<Platform, AdAccountConnector>([
      [Platform.META, metaConnector],
      [Platform.GOOGLE, googleConnector],
      [Platform.LINKEDIN, linkedinConnector],
      [Platform.X, xConnector],
      [Platform.SNAPCHAT, snapchatConnector],
      [Platform.TIKTOK, tiktokConnector],
    ]);
  }

  /** Returns the connector for a platform or throws when unsupported. */
  get(platform: Platform): AdAccountConnector {
    const connector = this.connectors.get(platform);
    if (!connector) {
      throw new NotFoundException(
        `No connector found for platform: ${platform}`,
      );
    }
    return connector;
  }
}
