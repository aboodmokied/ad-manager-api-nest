import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { WorkspaceRole } from '@uacm/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceRolesGuard } from '../../common/guards/workspace-roles.guard';
import { WorkspaceContextInterceptor } from '../../common/interceptors/workspace-context.interceptor';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TokenPayload } from '../../auth/interfaces/auth.interfaces';
import { WorkspacesService } from './workspaces.service';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  AddWorkspaceMemberDto,
  UpdateMemberRoleDto,
  WorkspaceResponseDto,
  WorkspaceMemberResponseDto,
} from './dto';

@ApiTags('workspaces')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, WorkspaceRolesGuard)
@UseInterceptors(WorkspaceContextInterceptor)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new workspace' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Workspace created successfully',
    type: WorkspaceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Slug already exists',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated',
  })
  async create(
    @CurrentUser() user: TokenPayload,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all workspaces for the authenticated user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of workspaces user is a member of',
    type: [WorkspaceResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated',
  })
  async findAll(@CurrentUser() user: TokenPayload) {
    return this.workspacesService.findAllForUser(user.sub);
  }

  @Get(':workspaceId')
  @ApiOperation({ summary: 'Get workspace details by ID' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Workspace details',
    type: WorkspaceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Workspace not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not a member of workspace',
  })
  async findById(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.workspacesService.findById(workspaceId, user.sub);
  }

  @Patch(':workspaceId')
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Update workspace configuration' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Workspace updated successfully',
    type: WorkspaceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Workspace not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async update(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(workspaceId, dto);
  }

  @Delete(':workspaceId')
  @Roles(WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Delete workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Workspace deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Workspace not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Only OWNER can delete workspace',
  })
  async delete(@Param('workspaceId') workspaceId: string) {
    return this.workspacesService.delete(workspaceId);
  }

  @Get(':workspaceId/members')
  @ApiOperation({ summary: 'List all members in a workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of workspace members',
    type: [WorkspaceMemberResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Workspace not found',
  })
  async listMembers(@Param('workspaceId') workspaceId: string) {
    return this.workspacesService.listMembers(workspaceId);
  }

  @Post(':workspaceId/members')
  @HttpCode(HttpStatus.CREATED)
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Add a new member to workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Member added successfully',
    type: WorkspaceMemberResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User already in workspace',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async addMember(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: AddWorkspaceMemberDto,
    @CurrentUser() user?: TokenPayload,
  ) {
    if (user?.sub) {
      return this.workspacesService.addMember(workspaceId, dto, user.sub);
    }
    return this.workspacesService.addMember(workspaceId, dto);
  }

  @Patch(':workspaceId/members/:memberId')
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Update member role in workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'memberId', description: 'Member ID or User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Member role updated successfully',
    type: WorkspaceMemberResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Member not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async updateMemberRole(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user?: TokenPayload,
  ) {
    if (user?.sub) {
      return this.workspacesService.updateMemberRole(
        workspaceId,
        memberId,
        dto,
        user.sub,
      );
    }
    return this.workspacesService.updateMemberRole(workspaceId, memberId, dto);
  }

  @Delete(':workspaceId/members/:memberId')
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Remove a member from workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'memberId', description: 'Member ID or User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Member removed successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Member not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    if (user?.sub) {
      return this.workspacesService.removeMember(
        workspaceId,
        memberId,
        user.sub,
      );
    }
    return this.workspacesService.removeMember(workspaceId, memberId);
  }
}
