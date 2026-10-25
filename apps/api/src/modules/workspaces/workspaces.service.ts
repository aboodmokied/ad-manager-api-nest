import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceRole } from '@uacm/shared-types';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  AddWorkspaceMemberDto,
  UpdateMemberRoleDto,
} from './dto';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to slugify workspace name if slug is not provided.
   * If sanitized slug is empty (e.g. Arabic or non-ASCII characters),
   * falls back to `workspace-${Date.now().toString(36)}` to prevent empty slug conflicts.
   */
  private generateSlug(name: string): string {
    const sanitized = (name || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!sanitized || sanitized.length === 0) {
      return `workspace-${Date.now().toString(36)}`;
    }
    return sanitized;
  }

  /**
   * Creates a new workspace and assigns the creating user as OWNER.
   */
  async create(userId: string, dto: CreateWorkspaceDto) {
    const rawSlug = dto.slug?.trim();
    const slug = rawSlug ? rawSlug.toLowerCase() : this.generateSlug(dto.name);

    const existingSlug = await this.prisma.workspace.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      throw new ConflictException(
        `Workspace with slug '${slug}' already exists`,
      );
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        name: dto.name.trim(),
        slug,
        baseCurrency: dto.baseCurrency || 'USD',
        members: {
          create: {
            userId,
            role: WorkspaceRole.OWNER,
          },
        },
      },
      include: {
        members: true,
      },
    });

    this.logger.log(
      `Created workspace '${workspace.name}' (${workspace.id}) by user ${userId}`,
    );

    return {
      ...workspace,
      role: WorkspaceRole.OWNER,
    };
  }

  /**
   * Returns all workspaces where the user is an active member, along with their role.
   */
  async findAllForUser(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: true,
      },
    });

    return memberships
      .filter((m) => m.workspace)
      .map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        baseCurrency: m.workspace.baseCurrency,
        role: m.role as WorkspaceRole,
        createdAt: m.workspace.createdAt,
        updatedAt: m.workspace.updatedAt,
      }));
  }

  /**
   * Returns workspace details if the requesting user is a member.
   */
  async findById(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        workspace: true,
      },
    });

    if (!membership || !membership.workspace) {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
      });
      if (!workspace) {
        throw new NotFoundException(`Workspace '${workspaceId}' not found`);
      }
      throw new ForbiddenException(
        'Access denied: You do not have access to this workspace',
      );
    }

    return {
      ...membership.workspace,
      role: membership.role as WorkspaceRole,
    };
  }

  /**
   * Updates workspace configuration (name / base currency).
   */
  async update(workspaceId: string, dto: UpdateWorkspaceDto) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException(`Workspace '${workspaceId}' not found`);
    }

    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.baseCurrency && { baseCurrency: dto.baseCurrency }),
      },
    });

    this.logger.log(`Updated workspace ${workspaceId}`);
    return updated;
  }

  /**
   * Deletes workspace and cascades all members and resources.
   */
  async delete(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException(`Workspace '${workspaceId}' not found`);
    }

    await this.prisma.workspace.delete({
      where: { id: workspaceId },
    });

    this.logger.log(`Deleted workspace ${workspaceId}`);
    return { success: true, message: 'Workspace deleted successfully' };
  }

  /**
   * Adds a member with an assigned role to a workspace.
   */
  async addMember(
    workspaceId: string,
    dto: AddWorkspaceMemberDto,
    requesterUserId?: string,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException(`Workspace '${workspaceId}' not found`);
    }

    if (dto.role === WorkspaceRole.OWNER && requesterUserId) {
      const requesterMember = await this.prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: requesterUserId,
          },
        },
      });
      if (!requesterMember || requesterMember.role !== WorkspaceRole.OWNER) {
        throw new ForbiddenException(
          'Only an OWNER can add a new member with OWNER role',
        );
      }
    }

    const existingMember = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: dto.userId,
        },
      },
    });
    if (existingMember) {
      throw new ConflictException(
        `User '${dto.userId}' is already a member of workspace '${workspaceId}'`,
      );
    }

    const member = await this.prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: dto.userId,
        role: dto.role,
      },
    });

    this.logger.log(
      `Added member ${dto.userId} to workspace ${workspaceId} with role ${dto.role}`,
    );
    return member;
  }

  /**
   * Lists all members of a workspace.
   */
  async listMembers(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException(`Workspace '${workspaceId}' not found`);
    }

    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
    });
  }

  /**
   * Updates a member's role within a workspace.
   */
  async updateMemberRole(
    workspaceId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
    requesterUserId?: string,
  ) {
    const member =
      (await this.prisma.workspaceMember.findUnique({
        where: { id: memberId },
      })) ||
      (await this.prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: memberId },
      }));

    if (!member || member.workspaceId !== workspaceId) {
      throw new NotFoundException(`Workspace member '${memberId}' not found`);
    }

    if (requesterUserId) {
      const requesterMember = await this.prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: requesterUserId,
          },
        },
      });

      // Role escalation protection: non-owners cannot promote anyone to OWNER
      if (
        dto.role === WorkspaceRole.OWNER &&
        (!requesterMember || requesterMember.role !== WorkspaceRole.OWNER)
      ) {
        throw new ForbiddenException(
          'Only an OWNER can promote a member to OWNER',
        );
      }

      // Owner demotion protection: non-owners cannot demote an OWNER
      if (
        member.role === WorkspaceRole.OWNER &&
        dto.role !== WorkspaceRole.OWNER &&
        (!requesterMember || requesterMember.role !== WorkspaceRole.OWNER)
      ) {
        throw new ForbiddenException('Only an OWNER can demote an OWNER');
      }
    }

    // Zero-owner protection: cannot demote the last OWNER of a workspace
    if (
      member.role === WorkspaceRole.OWNER &&
      dto.role !== WorkspaceRole.OWNER
    ) {
      const members = await this.prisma.workspaceMember.findMany({
        where: { workspaceId },
      });
      const ownerCount = (members || []).filter(
        (m) => m.role === WorkspaceRole.OWNER,
      ).length;
      if (ownerCount <= 1) {
        throw new ForbiddenException(
          'Cannot demote the last OWNER of a workspace',
        );
      }
    }

    const updated = await this.prisma.workspaceMember.update({
      where: { id: member.id },
      data: {
        role: dto.role,
      },
    });

    this.logger.log(
      `Updated member ${member.id} role to ${dto.role} in workspace ${workspaceId}`,
    );
    return updated;
  }

  /**
   * Removes a member from a workspace.
   */
  async removeMember(
    workspaceId: string,
    memberId: string,
    requesterUserId?: string,
  ) {
    const member =
      (await this.prisma.workspaceMember.findUnique({
        where: { id: memberId },
      })) ||
      (await this.prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: memberId },
      }));

    if (!member || member.workspaceId !== workspaceId) {
      throw new NotFoundException(`Workspace member '${memberId}' not found`);
    }

    if (requesterUserId) {
      const requesterMember = await this.prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: requesterUserId,
          },
        },
      });

      // Non-owners cannot delete/remove an OWNER
      if (
        member.role === WorkspaceRole.OWNER &&
        (!requesterMember || requesterMember.role !== WorkspaceRole.OWNER)
      ) {
        throw new ForbiddenException(
          'Only an OWNER can remove an OWNER member',
        );
      }
    }

    // Zero-owner protection: cannot remove the last OWNER
    if (member.role === WorkspaceRole.OWNER) {
      const members = await this.prisma.workspaceMember.findMany({
        where: { workspaceId },
      });
      const ownerCount = (members || []).filter(
        (m) => m.role === WorkspaceRole.OWNER,
      ).length;
      if (ownerCount <= 1) {
        throw new ForbiddenException(
          'Cannot remove the last OWNER of a workspace',
        );
      }
    }

    await this.prisma.workspaceMember.delete({
      where: { id: member.id },
    });

    this.logger.log(
      `Removed member ${member.id} from workspace ${workspaceId}`,
    );
    return { success: true, message: 'Member removed successfully' };
  }
}
