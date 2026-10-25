import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { WorkspaceRole } from '@uacm/shared-types';

export class AddWorkspaceMemberDto {
  @ApiProperty({
    description: 'User ID of the member to add',
    example: 'user-12345',
  })
  @IsString()
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @ApiProperty({
    description: 'Workspace role assigned to member',
    enum: WorkspaceRole,
    default: WorkspaceRole.MEDIA_BUYER,
    example: WorkspaceRole.MEDIA_BUYER,
  })
  @IsEnum(WorkspaceRole, {
    message:
      'Role must be one of: OWNER, ADMIN, MEDIA_BUYER, ANALYST, CLIENT_VIEWER',
  })
  role: WorkspaceRole;
}
