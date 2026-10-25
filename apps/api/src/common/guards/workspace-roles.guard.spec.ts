import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceRole } from '@uacm/shared-types';
import { WorkspaceRolesGuard } from './workspace-roles.guard';
import { PrismaService } from '../../prisma/prisma.service';

describe('WorkspaceRolesGuard', () => {
  let guard: WorkspaceRolesGuard;
  let reflector: Reflector;
  let prisma: PrismaService;

  const createMockContext = (
    requestData: Record<string, any>,
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => requestData,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    prisma = {
      workspaceMember: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    guard = new WorkspaceRolesGuard(reflector, prisma);
  });

  it('allows access when no roles are specified on the route', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext({});
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('allows access when requiredRoles is an empty array', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

    const context = createMockContext({});
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('allows access when user role exactly matches the required role', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([WorkspaceRole.ADMIN]);

    const context = createMockContext({
      workspaceRole: WorkspaceRole.ADMIN,
    });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('allows access when user role has higher hierarchy than required role (OWNER > MEDIA_BUYER)', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([WorkspaceRole.MEDIA_BUYER]);

    const context = createMockContext({
      workspaceRole: WorkspaceRole.OWNER,
    });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('allows access when user role has higher hierarchy than required role (ADMIN > MEDIA_BUYER)', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([WorkspaceRole.MEDIA_BUYER]);

    const context = createMockContext({
      workspaceRole: WorkspaceRole.ADMIN,
    });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('allows access when user matches one of multiple accepted roles', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);

    const context = createMockContext({
      workspaceRole: WorkspaceRole.ADMIN,
    });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('throws ForbiddenException when user has lower hierarchy role (CLIENT_VIEWER < MEDIA_BUYER)', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([WorkspaceRole.MEDIA_BUYER]);

    const context = createMockContext({
      workspaceRole: WorkspaceRole.CLIENT_VIEWER,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Insufficient permissions: Role CLIENT_VIEWER cannot perform this action',
    );
  });

  it('throws ForbiddenException when user has lower hierarchy role (ANALYST < ADMIN)', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([WorkspaceRole.ADMIN]);

    const context = createMockContext({
      workspaceRole: WorkspaceRole.ANALYST,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when no workspaceRole is present and cannot be resolved', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([WorkspaceRole.ADMIN]);

    const context = createMockContext({
      headers: {},
      user: { sub: 'user-1' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'No active workspace role found for this request',
    );
  });

  it('resolves role via Prisma when request.workspaceRole is not set but workspaceId is in header', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([WorkspaceRole.ADMIN]);

    (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({
      workspaceId: 'ws-123',
      userId: 'user-1',
      role: WorkspaceRole.ADMIN,
      workspace: { id: 'ws-123', name: 'Test' },
    });

    const req: Record<string, any> = {
      headers: { 'x-workspace-id': 'ws-123' },
      user: { sub: 'user-1' },
    };
    const context = createMockContext(req);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(req.workspaceRole).toBe(WorkspaceRole.ADMIN);
    expect(req.workspaceId).toBe('ws-123');
  });

  it('throws ForbiddenException on parameter desynchronization (header vs route param mismatch)', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([WorkspaceRole.ADMIN]);

    const req: Record<string, any> = {
      headers: { 'x-workspace-id': 'ws-attacker' },
      params: { workspaceId: 'ws-victim' },
      user: { sub: 'user-1' },
    };
    const context = createMockContext(req);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Workspace context desynchronization: header does not match target resource',
    );
  });

  it('prioritizes route parameter and resolves role against route resource', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([WorkspaceRole.ADMIN]);

    (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({
      workspaceId: 'ws-route',
      userId: 'user-1',
      role: WorkspaceRole.ADMIN,
      workspace: { id: 'ws-route', name: 'Route WS' },
    });

    const req: Record<string, any> = {
      params: { workspaceId: 'ws-route' },
      user: { sub: 'user-1' },
    };
    const context = createMockContext(req);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_userId: {
          workspaceId: 'ws-route',
          userId: 'user-1',
        },
      },
      include: { workspace: true },
    });
    expect(req.workspaceId).toBe('ws-route');
  });
});
