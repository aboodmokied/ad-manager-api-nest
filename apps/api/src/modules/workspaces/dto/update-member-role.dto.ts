import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { WorkspaceRole } from '@uacm/shared-types';

export class UpdateMemberRoleDto {
  @ApiProperty({
    description: 'Updated workspace role for member',
    enum: WorkspaceRole,
    example: WorkspaceRole.ADMIN,
  })
  @IsEnum(WorkspaceRole, {
    message:
      'Role must be one of: OWNER, ADMIN, MEDIA_BUYER, ANALYST, CLIENT_VIEWER',
  })
  role: WorkspaceRole;
}
