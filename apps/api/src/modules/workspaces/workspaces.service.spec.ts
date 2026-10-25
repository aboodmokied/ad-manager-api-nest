import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole, CurrencyCode } from '@uacm/shared-types';
import { WorkspacesService } from './workspaces.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const mockPrisma = {
      workspace: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      workspaceMember: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a workspace and assigns the creator as OWNER', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(null);
      const createdWorkspace = {
        id: 'ws-1',
        name: 'Alpha Agency',
        slug: 'alpha-agency',
        baseCurrency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [{ id: 'wsm-1', userId: 'user-1', role: WorkspaceRole.OWNER }],
      };
      (prisma.workspace.create as jest.Mock).mockResolvedValue(
        createdWorkspace,
      );

      const result = await service.create('user-1', {
        name: 'Alpha Agency',
      });

      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
        where: { slug: 'alpha-agency' },
      });
      expect(prisma.workspace.create).toHaveBeenCalledWith({
        data: {
          name: 'Alpha Agency',
          slug: 'alpha-agency',
          baseCurrency: 'USD',
          members: {
            create: {
              userId: 'user-1',
              role: WorkspaceRole.OWNER,
            },
          },
        },
        include: { members: true },
      });
      expect(result.role).toBe(WorkspaceRole.OWNER);
      expect(result.id).toBe('ws-1');
    });

    it('uses custom slug and currency when provided', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.workspace.create as jest.Mock).mockResolvedValue({
        id: 'ws-2',
        name: 'Custom',
        slug: 'custom-slug',
        baseCurrency: CurrencyCode.EUR,
        members: [],
      });

      await service.create('user-1', {
        name: 'Custom',
        slug: 'custom-slug',
        baseCurrency: CurrencyCode.EUR,
      });

      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
        where: { slug: 'custom-slug' },
      });
      expect(prisma.workspace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'custom-slug',
            baseCurrency: CurrencyCode.EUR,
          }),
        }),
      );
    });

    it('throws ConflictException when slug is already taken', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: 'existing-ws',
        slug: 'duplicate-slug',
      });

      await expect(
        service.create('user-1', {
          name: 'Duplicate',
          slug: 'duplicate-slug',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.workspace.create).not.toHaveBeenCalled();
    });

    it('generates fallback slug for non-ASCII/Arabic name when slug not provided', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.workspace.create as jest.Mock).mockResolvedValue({
        id: 'ws-arabic',
        name: 'وكالة الإعلانات',
        slug: 'workspace-generated',
        baseCurrency: 'USD',
        members: [],
      });

      await service.create('user-1', {
        name: 'وكالة الإعلانات',
      });

      expect(prisma.workspace.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            slug: expect.stringMatching(/^workspace-[a-z0-9]+$/),
          }),
        }),
      );
    });
  });

  describe('findAllForUser', () => {
    it('returns all workspaces for user with their assigned roles', async () => {
      const mockMemberships = [
        {
          id: 'wsm-1',
          userId: 'user-1',
          role: WorkspaceRole.OWNER,
          workspace: {
            id: 'ws-1',
            name: 'Workspace One',
            slug: 'ws-1',
            baseCurrency: 'USD',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        {
          id: 'wsm-2',
          userId: 'user-1',
          role: WorkspaceRole.MEDIA_BUYER,
          workspace: {
            id: 'ws-2',
            name: 'Workspace Two',
            slug: 'ws-2',
            baseCurrency: 'EUR',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ];
      (prisma.workspaceMember.findMany as jest.Mock).mockResolvedValue(
        mockMemberships,
      );

      const result = await service.findAllForUser('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe(WorkspaceRole.OWNER);
      expect(result[1].role).toBe(WorkspaceRole.MEDIA_BUYER);
      expect(result[0].name).toBe('Workspace One');
    });
  });

  describe('findById', () => {
    it('returns workspace when user is an active member', async () => {
      (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({
        workspaceId: 'ws-1',
        userId: 'user-1',
        role: WorkspaceRole.ADMIN,
        workspace: {
          id: 'ws-1',
          name: 'Workspace One',
          slug: 'ws-1',
          baseCurrency: 'USD',
        },
      });

      const result = await service.findById('ws-1', 'user-1');

      expect(result.id).toBe('ws-1');
      expect(result.role).toBe(WorkspaceRole.ADMIN);
    });

    it('throws NotFoundException if workspace does not exist', async () => {
      (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findById('non-existent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException if user is not a member of existing workspace', async () => {
      (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: 'ws-foreign',
        name: 'Foreign',
      });

      await expect(service.findById('ws-foreign', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('updates workspace attributes', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: 'ws-1',
        name: 'Old Name',
      });
      (prisma.workspace.update as jest.Mock).mockResolvedValue({
        id: 'ws-1',
        name: 'New Name',
        baseCurrency: 'EUR',
      });

      const result = await service.update('ws-1', {
        name: 'New Name',
        baseCurrency: CurrencyCode.EUR,
      });

      expect(result.name).toBe('New Name');
      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: 'ws-1' },
        data: { name: 'New Name', baseCurrency: CurrencyCode.EUR },
      });
    });

    it('throws NotFoundException when updating non-existent workspace', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.update('unknown', { name: 'New' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('deletes workspace and returns success', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: 'ws-1',
      });
      (prisma.workspace.delete as jest.Mock).mockResolvedValue({ id: 'ws-1' });

      const result = await service.delete('ws-1');

      expect(result.success).toBe(true);
      expect(prisma.workspace.delete).toHaveBeenCalledWith({
        where: { id: 'ws-1' },
      });
    });

    it('throws NotFoundException when deleting non-existent workspace', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.delete('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('member management', () => {
    it('adds a member to a workspace', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: 'ws-1',
      });
      (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.workspaceMember.create as jest.Mock).mockResolvedValue({
        id: 'wsm-new',
        workspaceId: 'ws-1',
        userId: 'user-2',
        role: WorkspaceRole.MEDIA_BUYER,
      });

      const result = await service.addMember('ws-1', {
        userId: 'user-2',
        role: WorkspaceRole.MEDIA_BUYER,
      });

      expect(result.userId).toBe('user-2');
      expect(result.role).toBe(WorkspaceRole.MEDIA_BUYER);
    });

    it('throws ConflictException when adding an already existing member', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: 'ws-1',
      });
      (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({
        id: 'wsm-existing',
      });

      await expect(
        service.addMember('ws-1', {
          userId: 'user-2',
          role: WorkspaceRole.MEDIA_BUYER,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('lists members of a workspace', async () => {
      (prisma.workspace.findUnique as jest.Mock).mockResolvedValue({
        id: 'ws-1',
      });
      (prisma.workspaceMember.findMany as jest.Mock).mockResolvedValue([
        { id: 'm1', role: WorkspaceRole.OWNER },
        { id: 'm2', role: WorkspaceRole.MEDIA_BUYER },
      ]);

      const result = await service.listMembers('ws-1');
      expect(result).toHaveLength(2);
    });

    it('updates member role', async () => {
      (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({
        id: 'm1',
        workspaceId: 'ws-1',
        role: WorkspaceRole.MEDIA_BUYER,
      });
      (prisma.workspaceMember.update as jest.Mock).mockResolvedValue({
        id: 'm1',
        workspaceId: 'ws-1',
        role: WorkspaceRole.ADMIN,
      });

      const result = await service.updateMemberRole('ws-1', 'm1', {
        role: WorkspaceRole.ADMIN,
      });

      expect(result.role).toBe(WorkspaceRole.ADMIN);
      expect(prisma.workspaceMember.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { role: WorkspaceRole.ADMIN },
      });
    });

    it('removes member from workspace', async () => {
      (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({
        id: 'm1',
        workspaceId: 'ws-1',
      });
      (prisma.workspaceMember.delete as jest.Mock).mockResolvedValue({
        id: 'm1',
      });

      const result = await service.removeMember('ws-1', 'm1');

      expect(result.success).toBe(true);
      expect(prisma.workspaceMember.delete).toHaveBeenCalledWith({
        where: { id: 'm1' },
      });
    });

    it('rejects non-owner promoting a member to OWNER', async () => {
      (prisma.workspaceMember.findUnique as jest.Mock).mockImplementation(
        (args: any) => {
          if (args.where?.id === 'm1') {
            return Promise.resolve({
              id: 'm1',
              workspaceId: 'ws-1',
              role: WorkspaceRole.MEDIA_BUYER,
            });
          }
          if (args.where?.workspaceId_userId?.userId === 'admin-user') {
            return Promise.resolve({
              id: 'm-admin',
              workspaceId: 'ws-1',
              userId: 'admin-user',
              role: WorkspaceRole.ADMIN,
            });
          }
          return Promise.resolve(null);
        },
      );

      await expect(
        service.updateMemberRole(
          'ws-1',
          'm1',
          { role: WorkspaceRole.OWNER },
          'admin-user',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects non-owner demoting an OWNER member', async () => {
      (prisma.workspaceMember.findUnique as jest.Mock).mockImplementation(
        (args: any) => {
          if (args.where?.id === 'm-owner') {
            return Promise.resolve({
              id: 'm-owner',
              workspaceId: 'ws-1',
              role: WorkspaceRole.OWNER,
            });
          }
          if (args.where?.workspaceId_userId?.userId === 'admin-user') {
            return Promise.resolve({
              id: 'm-admin',
              workspaceId: 'ws-1',
              userId: 'admin-user',
              role: WorkspaceRole.ADMIN,
            });
          }
          return Promise.resolve(null);
        },
      );

      await expect(
        service.updateMemberRole(
          'ws-1',
          'm-owner',
          { role: WorkspaceRole.ADMIN },
          'admin-user',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects demoting the last OWNER in a workspace', async () => {
      (prisma.workspaceMember.findUnique as jest.Mock).mockImplementation(
        (args: any) => {
          if (args.where?.id === 'm-owner') {
            return Promise.resolve({
              id: 'm-owner',
              workspaceId: 'ws-1',
              role: WorkspaceRole.OWNER,
            });
          }
          if (args.where?.workspaceId_userId?.userId === 'owner-user') {
            return Promise.resolve({
              id: 'm-owner',
              workspaceId: 'ws-1',
              userId: 'owner-user',
              role: WorkspaceRole.OWNER,
            });
          }
          return Promise.resolve(null);
        },
      );

      (prisma.workspaceMember.findMany as jest.Mock).mockResolvedValue([
        { id: 'm-owner', role: WorkspaceRole.OWNER },
      ]);

      await expect(
        service.updateMemberRole(
          'ws-1',
          'm-owner',
          { role: WorkspaceRole.ADMIN },
          'owner-user',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects non-owner removing an OWNER member', async () => {
      (prisma.workspaceMember.findUnique as jest.Mock).mockImplementation(
        (args: any) => {
          if (args.where?.id === 'm-owner') {
            return Promise.resolve({
              id: 'm-owner',
              workspaceId: 'ws-1',
              role: WorkspaceRole.OWNER,
            });
          }
          if (args.where?.workspaceId_userId?.userId === 'admin-user') {
            return Promise.resolve({
              id: 'm-admin',
              workspaceId: 'ws-1',
              userId: 'admin-user',
              role: WorkspaceRole.ADMIN,
            });
          }
          return Promise.resolve(null);
        },
      );

      await expect(
        service.removeMember('ws-1', 'm-owner', 'admin-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects removing the last OWNER in a workspace', async () => {
      (prisma.workspaceMember.findUnique as jest.Mock).mockImplementation(
        (args: any) => {
          if (args.where?.id === 'm-owner') {
            return Promise.resolve({
              id: 'm-owner',
              workspaceId: 'ws-1',
              role: WorkspaceRole.OWNER,
            });
          }
          if (args.where?.workspaceId_userId?.userId === 'owner-user') {
            return Promise.resolve({
              id: 'm-owner',
              workspaceId: 'ws-1',
              userId: 'owner-user',
              role: WorkspaceRole.OWNER,
            });
          }
          return Promise.resolve(null);
        },
      );

      (prisma.workspaceMember.findMany as jest.Mock).mockResolvedValue([
        { id: 'm-owner', role: WorkspaceRole.OWNER },
      ]);

      await expect(
        service.removeMember('ws-1', 'm-owner', 'owner-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
