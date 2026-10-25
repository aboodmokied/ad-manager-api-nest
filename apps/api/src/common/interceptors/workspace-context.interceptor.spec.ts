import {
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { of } from 'rxjs';
import { WorkspaceRole } from '@uacm/shared-types';
import { WorkspaceContextInterceptor } from './workspace-context.interceptor';
import { PrismaService } from '../../prisma/prisma.service';

describe('WorkspaceContextInterceptor', () => {
  let interceptor: WorkspaceContextInterceptor;
  let prisma: PrismaService;

  const createMockHandler = (): CallHandler => ({
    handle: jest.fn(() => of('handled-result')),
  });

  const createMockContext = (
    request: Record<string, any>,
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    prisma = {
      workspaceMember: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    interceptor = new WorkspaceContextInterceptor(prisma);
  });

  it('bypasses check when no workspaceId is in header, params, or query', async () => {
    const request = {
      headers: {},
      params: {},
      query: {},
      user: { sub: 'user-1' },
    };
    const context = createMockContext(request);
    const handler = createMockHandler();

    const result$ = await interceptor.intercept(context, handler);
    result$.subscribe((val) => {
      expect(val).toBe('handled-result');
    });

    expect(handler.handle).toHaveBeenCalled();
    expect(prisma.workspaceMember.findUnique).not.toHaveBeenCalled();
  });

  it('extracts workspaceId from x-workspace-id header and attaches context', async () => {
    const mockWorkspace = {
      id: 'ws-456',
      name: 'Acme Media',
      slug: 'acme-media',
      baseCurrency: 'USD',
    };
    const mockMembership = {
      id: 'wsm-1',
      workspaceId: 'ws-456',
      userId: 'user-1',
      role: WorkspaceRole.MEDIA_BUYER,
      workspace: mockWorkspace,
    };
    (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue(
      mockMembership,
    );

    const request: Record<string, any> = {
      headers: { 'x-workspace-id': 'ws-456' },
      user: { sub: 'user-1' },
    };
    const context = createMockContext(request);
    const handler = createMockHandler();

    const result$ = await interceptor.intercept(context, handler);
    result$.subscribe((val) => {
      expect(val).toBe('handled-result');
    });

    expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_userId: {
          workspaceId: 'ws-456',
          userId: 'user-1',
        },
      },
      include: {
        workspace: true,
      },
    });

    expect(request.workspaceId).toBe('ws-456');
    expect(request.workspaceRole).toBe(WorkspaceRole.MEDIA_BUYER);
    expect(request.workspace).toEqual(mockWorkspace);
  });

  it('extracts workspaceId from route params.workspaceId', async () => {
    const mockWorkspace = { id: 'ws-params', name: 'Params WS' };
    (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({
      workspaceId: 'ws-params',
      userId: 'user-1',
      role: WorkspaceRole.ADMIN,
      workspace: mockWorkspace,
    });

    const request: Record<string, any> = {
      headers: {},
      params: { workspaceId: 'ws-params' },
      user: { sub: 'user-1' },
    };
    const context = createMockContext(request);
    const handler = createMockHandler();

    await interceptor.intercept(context, handler);

    expect(request.workspaceId).toBe('ws-params');
    expect(request.workspaceRole).toBe(WorkspaceRole.ADMIN);
  });

  it('extracts workspaceId from query.workspaceId', async () => {
    const mockWorkspace = { id: 'ws-query', name: 'Query WS' };
    (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({
      workspaceId: 'ws-query',
      userId: 'user-1',
      role: WorkspaceRole.OWNER,
      workspace: mockWorkspace,
    });

    const request: Record<string, any> = {
      headers: {},
      query: { workspaceId: 'ws-query' },
      user: { sub: 'user-1' },
    };
    const context = createMockContext(request);
    const handler = createMockHandler();

    await interceptor.intercept(context, handler);

    expect(request.workspaceId).toBe('ws-query');
    expect(request.workspaceRole).toBe(WorkspaceRole.OWNER);
  });

  it('throws ForbiddenException when workspaceId is present but user is not authenticated', async () => {
    const request: Record<string, any> = {
      headers: { 'x-workspace-id': 'ws-123' },
      user: undefined,
    };
    const context = createMockContext(request);
    const handler = createMockHandler();

    await expect(interceptor.intercept(context, handler)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(interceptor.intercept(context, handler)).rejects.toThrow(
      'User authentication required for workspace access',
    );
  });

  it('throws ForbiddenException when membership does not exist (access denied to foreign workspace)', async () => {
    (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue(null);

    const request: Record<string, any> = {
      headers: { 'x-workspace-id': 'ws-foreign' },
      user: { sub: 'user-foreign' },
    };
    const context = createMockContext(request);
    const handler = createMockHandler();

    await expect(interceptor.intercept(context, handler)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(interceptor.intercept(context, handler)).rejects.toThrow(
      'Access denied: You do not have access to this workspace',
    );
  });

  it('throws ForbiddenException on parameter desynchronization (header vs route param mismatch)', async () => {
    const request: Record<string, any> = {
      headers: { 'x-workspace-id': 'ws-attacker' },
      params: { workspaceId: 'ws-victim' },
      user: { sub: 'user-1' },
    };
    const context = createMockContext(request);
    const handler = createMockHandler();

    await expect(interceptor.intercept(context, handler)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(interceptor.intercept(context, handler)).rejects.toThrow(
      'Workspace context desynchronization: header does not match target resource',
    );
    expect(prisma.workspaceMember.findUnique).not.toHaveBeenCalled();
  });

  it('reuses already resolved workspace context if attached by guard for matching workspaceId', async () => {
    const mockWorkspace = { id: 'ws-cached', name: 'Cached WS' };
    const request: Record<string, any> = {
      params: { workspaceId: 'ws-cached' },
      user: { sub: 'user-1' },
      workspaceId: 'ws-cached',
      workspaceRole: WorkspaceRole.OWNER,
      workspace: mockWorkspace,
    };
    const context = createMockContext(request);
    const handler = createMockHandler();

    const result$ = await interceptor.intercept(context, handler);
    result$.subscribe((val) => {
      expect(val).toBe('handled-result');
    });

    expect(handler.handle).toHaveBeenCalled();
    expect(prisma.workspaceMember.findUnique).not.toHaveBeenCalled();
  });
});
