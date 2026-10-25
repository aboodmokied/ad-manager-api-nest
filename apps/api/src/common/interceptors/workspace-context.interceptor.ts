import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Intercepts incoming requests to extract and verify workspace tenant context.
 *
 * Workspace ID resolution priority:
 * 1. Route Params: `request.params.workspaceId` or `request.params.id` (definitive target resource)
 * 2. Request Header: `x-workspace-id` (case-insensitive)
 * 3. Query Params: `request.query.workspaceId`
 *
 * Header vs Route Param desynchronization check:
 * - If both header and route parameter exist and mismatch, rejects immediately with 403 Forbidden
 *   to eliminate cross-tenant BOLA / parameter desynchronization attacks.
 *
 * If no workspace ID is provided on the request, bypasses check (e.g. creating a workspace,
 * listing workspaces, or health check).
 *
 * If workspace ID is present:
 * - Requires authenticated user (`request.user.sub`).
 * - If context is already attached and matches, reuses it without redundant DB lookup.
 * - Validates membership in database.
 * - Throws 403 ForbiddenException if user is not a member or workspace does not exist.
 * - Attaches `workspaceId`, `workspaceRole`, and `workspace` entity to `request`.
 */
@Injectable()
export class WorkspaceContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Populated by JwtAuthGuard (sub = userId)

    const routeWorkspaceId = request.params?.workspaceId || request.params?.id;
    const rawHeader =
      request.headers?.['x-workspace-id'] ||
      request.headers?.['X-Workspace-Id'];
    const headerWorkspaceId = Array.isArray(rawHeader)
      ? rawHeader[0]
      : rawHeader;

    // Cross-tenant parameter desynchronization check: Header vs Route Param mismatch
    if (
      headerWorkspaceId &&
      routeWorkspaceId &&
      String(headerWorkspaceId) !== String(routeWorkspaceId)
    ) {
      throw new ForbiddenException(
        'Workspace context desynchronization: header does not match target resource',
      );
    }

    // Workspace ID resolution priority: Route Params > Header > Query Params
    const workspaceId =
      routeWorkspaceId || headerWorkspaceId || request.query?.workspaceId;

    if (!workspaceId) {
      // If route does not specify a workspace ID (e.g. POST /workspaces, GET /workspaces, /api/health), proceed
      return next.handle();
    }

    if (!user || !user.sub) {
      throw new ForbiddenException(
        'User authentication required for workspace access',
      );
    }

    // Reuse verified context if already attached by guard for the same workspace ID
    if (
      request.workspace &&
      request.workspaceId === String(workspaceId) &&
      request.workspaceRole
    ) {
      return next.handle();
    }

    // Verify active membership in database
    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: String(workspaceId),
          userId: String(user.sub),
        },
      },
      include: {
        workspace: true,
      },
    });

    if (!membership || !membership.workspace) {
      throw new ForbiddenException(
        'Access denied: You do not have access to this workspace',
      );
    }

    // Attach verified tenant context to request
    request.workspaceId = membership.workspaceId;
    request.workspaceRole = membership.role;
    request.workspace = membership.workspace;

    return next.handle();
  }
}
