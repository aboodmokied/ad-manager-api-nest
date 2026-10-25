import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TokenPayload } from 'src/auth/interfaces/auth.interfaces';

/**
 * Extracts the authenticated user (JWT payload) from the request.
 * Only usable behind JwtAuthGuard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TokenPayload => {
    const request = context.switchToHttp().getRequest();
    return request.user;
  },
);
