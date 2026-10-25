import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceRole } from '@uacm/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

export const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  [WorkspaceRole.OWNER]: 100,
  [WorkspaceRole.ADMIN]: 80,
  [WorkspaceRole.MEDIA_BUYER]: 60,
  [WorkspaceRole.ANALYST]: 40,
  [WorkspaceRole.CLIENT_VIEWER]: 20,
};

@Injectable()
export class WorkspaceRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

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

    const requiredRoles = this.reflector.getAllAndOverride<WorkspaceRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Workspace ID resolution priority: Route Params > Header > Query Params
    const workspaceId =
      routeWorkspaceId || headerWorkspaceId || request.query?.workspaceId;

    let userRole: WorkspaceRole | undefined = request.workspaceRole;

    // Invalidate prior attached context if it was for a different workspace
    if (
      workspaceId &&
      request.workspaceId &&
      String(request.workspaceId) !== String(workspaceId)
    ) {
      userRole = undefined;
    }

    // If role not yet populated by interceptor, attempt resolution via Prisma if available
    if (!userRole && this.prisma && workspaceId) {
      const userId = request.user?.sub;

      if (userId) {
        const membership = await this.prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: String(workspaceId),
              userId: String(userId),
            },
          },
          include: {
            workspace: true,
          },
        });

        if (membership) {
          userRole = membership.role as WorkspaceRole;
          request.workspaceId = membership.workspaceId;
          request.workspaceRole = userRole;
          request.workspace = membership.workspace;
        }
      }
    }

    if (!userRole) {
      throw new ForbiddenException(
        'No active workspace role found for this request',
      );
    }

    const minRequiredLevel = Math.min(
      ...requiredRoles.map((r) => ROLE_HIERARCHY[r] ?? 0),
    );
    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;

    const hasPermission =
      userLevel >= minRequiredLevel || requiredRoles.includes(userRole);

    if (!hasPermission) {
      throw new ForbiddenException(
        `Insufficient permissions: Role ${userRole} cannot perform this action`,
      );
    }

    return true;
  }
}
