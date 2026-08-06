import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenPayload } from 'src/auth/interfaces/auth.interfaces';
import { TokenRevocationService } from 'src/auth/services/token-revocation.service';

/**
 * Guards protected endpoints: requires a valid, non-revoked access JWT.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly tokenRevocationService: TokenRevocationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'You must be logged in to access this resource',
      );
    }

    const token = authHeader.slice('Bearer '.length);

    let payload: TokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<TokenPayload>(token);
    } catch (error: any) {
      if (error?.name === 'TokenExpiredError') {
        throw new UnauthorizedException(
          'Session has expired. Please log in again.',
        );
      }
      throw new UnauthorizedException('Invalid session. Please log in again.');
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid session. Please log in again.');
    }

    if (await this.tokenRevocationService.isRevoked(token)) {
      throw new UnauthorizedException(
        'Session has been terminated. Please log in again.',
      );
    }

    request.user = payload;
    request.token = token;
    return true;
  }
}
