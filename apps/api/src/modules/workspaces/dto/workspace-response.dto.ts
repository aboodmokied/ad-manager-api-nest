import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkspaceRole } from '@uacm/shared-types';

export class WorkspaceResponseDto {
  @ApiProperty({ description: 'Workspace ID', example: 'ws-123' })
  id: string;

  @ApiProperty({ description: 'Workspace name', example: 'Acme Corp' })
  name: string;

  @ApiProperty({ description: 'Workspace unique slug', example: 'acme-corp' })
  slug: string;

  @ApiProperty({ description: 'Base currency code', example: 'USD' })
  baseCurrency: string;

  @ApiPropertyOptional({
    description: 'Current user role in this workspace',
    enum: WorkspaceRole,
    example: WorkspaceRole.OWNER,
  })
  role?: WorkspaceRole;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-10-24T00:00:00.000Z',
  })
  createdAt: string | Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-10-24T00:00:00.000Z',
  })
  updatedAt: string | Date;
}

export class WorkspaceMemberResponseDto {
  @ApiProperty({ description: 'Member record ID', example: 'wsm-123' })
  id: string;

  @ApiProperty({ description: 'Workspace ID', example: 'ws-123' })
  workspaceId: string;

  @ApiProperty({ description: 'User ID', example: 'user-123' })
  userId: string;

  @ApiProperty({
    description: 'Assigned role in workspace',
    enum: WorkspaceRole,
    example: WorkspaceRole.MEDIA_BUYER,
  })
  role: WorkspaceRole;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-10-24T00:00:00.000Z',
  })
  createdAt: string | Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-10-24T00:00:00.000Z',
  })
  updatedAt: string | Date;
}
