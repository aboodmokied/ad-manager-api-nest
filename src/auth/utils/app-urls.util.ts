import { ConfigService } from '@nestjs/config';

export const DEFAULT_BACKEND_URL = 'http://localhost:8030';
export const DEFAULT_FRONTEND_URL = 'http://localhost:3000';

/** Resolves the backend base URL used to build emailed links. */
export function getBackendUrl(configService: ConfigService): string {
  return configService.get<string>('BACKEND_URL') ?? DEFAULT_BACKEND_URL;
}

/** Resolves the frontend base URL used for OAuth/error redirects. */
export function getFrontendUrl(configService: ConfigService): string {
  return configService.get<string>('FRONTEND_URL') ?? DEFAULT_FRONTEND_URL;
}
