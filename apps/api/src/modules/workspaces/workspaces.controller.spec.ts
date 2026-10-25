import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceRole, CurrencyCode } from '@uacm/shared-types';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceRolesGuard } from '../../common/guards/workspace-roles.guard';
import { WorkspaceContextInterceptor } from '../../common/interceptors/workspace-context.interceptor';
import { TokenPayload } from '../../auth/interfaces/auth.interfaces';

describe('WorkspacesController', () => {
  let controller: WorkspacesController;
  let service: WorkspacesService;

  const mockUser: TokenPayload = {
    sub: 'user-123',
    email: 'user@example.com',
    type: 'access',
    jti: 'jti-1',
  };

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAllForUser: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      addMember: jest.fn(),
      listMembers: jest.fn(),
      updateMemberRole: jest.fn(),
      removeMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkspacesController],
      providers: [{ provide: WorkspacesService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspaceRolesGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(WorkspaceContextInterceptor)
      .useValue({ intercept: (_ctx: any, next: any) => next.handle() })
      .compile();

    controller = module.get<WorkspacesController>(WorkspacesController);
    service = module.get<WorkspacesService>(WorkspacesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('calls service.create with user.sub and dto', async () => {
      const dto = { name: 'New WS', baseCurrency: CurrencyCode.USD };
      (service.create as jest.Mock).mockResolvedValue({ id: 'ws-1', ...dto });

      const result = await controller.create(mockUser, dto);

      expect(service.create).toHaveBeenCalledWith('user-123', dto);
      expect(result.id).toBe('ws-1');
    });
  });

  describe('findAll', () => {
    it('calls service.findAllForUser with user.sub', async () => {
      (service.findAllForUser as jest.Mock).mockResolvedValue([
        { id: 'ws-1', name: 'WS 1' },
      ]);

      const result = await controller.findAll(mockUser);

      expect(service.findAllForUser).toHaveBeenCalledWith('user-123');
      expect(result).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('calls service.findById with workspaceId and user.sub', async () => {
      (service.findById as jest.Mock).mockResolvedValue({
        id: 'ws-1',
        name: 'WS 1',
      });

      const result = await controller.findById('ws-1', mockUser);

      expect(service.findById).toHaveBeenCalledWith('ws-1', 'user-123');
      expect(result.id).toBe('ws-1');
    });
  });

  describe('update', () => {
    it('calls service.update with workspaceId and dto', async () => {
      const dto = { name: 'Updated' };
      (service.update as jest.Mock).mockResolvedValue({
        id: 'ws-1',
        name: 'Updated',
      });

      const result = await controller.update('ws-1', dto);

      expect(service.update).toHaveBeenCalledWith('ws-1', dto);
      expect(result.name).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('calls service.delete with workspaceId', async () => {
      (service.delete as jest.Mock).mockResolvedValue({ success: true });

      const result = await controller.delete('ws-1');

      expect(service.delete).toHaveBeenCalledWith('ws-1');
      expect(result.success).toBe(true);
    });
  });

  describe('member routes', () => {
    it('calls service.listMembers with workspaceId', async () => {
      (service.listMembers as jest.Mock).mockResolvedValue([]);

      await controller.listMembers('ws-1');
      expect(service.listMembers).toHaveBeenCalledWith('ws-1');
    });

    it('calls service.addMember with workspaceId and dto', async () => {
      const dto = { userId: 'u2', role: WorkspaceRole.MEDIA_BUYER };
      (service.addMember as jest.Mock).mockResolvedValue({ id: 'm1', ...dto });

      const result = await controller.addMember('ws-1', dto);
      expect(service.addMember).toHaveBeenCalledWith('ws-1', dto);
      expect(result.id).toBe('m1');
    });

    it('calls service.updateMemberRole with workspaceId, memberId, and dto', async () => {
      const dto = { role: WorkspaceRole.ADMIN };
      (service.updateMemberRole as jest.Mock).mockResolvedValue({
        id: 'm1',
        role: WorkspaceRole.ADMIN,
      });

      const result = await controller.updateMemberRole('ws-1', 'm1', dto);
      expect(service.updateMemberRole).toHaveBeenCalledWith('ws-1', 'm1', dto);
      expect(result.role).toBe(WorkspaceRole.ADMIN);
    });

    it('calls service.removeMember with workspaceId and memberId', async () => {
      (service.removeMember as jest.Mock).mockResolvedValue({ success: true });

      const result = await controller.removeMember('ws-1', 'm1');
      expect(service.removeMember).toHaveBeenCalledWith('ws-1', 'm1');
      expect(result.success).toBe(true);
    });
  });
});
