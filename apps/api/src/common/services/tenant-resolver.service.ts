import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Resolves the tenant a connected account and its imported campaigns belong
 * to. UACM is tenant-aware: when a DEFAULT_TENANT_ID is configured, all
 * linked accounts are scoped to that tenant; otherwise each user acts as
 * their own tenant.
 */
@Injectable()
export class TenantResolverService {
  constructor(private readonly configService: ConfigService) {}

  /** Resolves the tenant id for a user id. */
  resolveTenantId(userId: string): string {
    // `||` is intentional: an empty AD_ACCOUNT_DEFAULT_TENANT_ID in the env
    // ("") must fall back to the per-user tenant instead of an empty string.
    return (
      this.configService.get<string>('AD_ACCOUNT_DEFAULT_TENANT_ID') || userId
    );
  }
}
