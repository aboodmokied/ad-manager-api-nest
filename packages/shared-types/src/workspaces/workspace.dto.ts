import { z } from 'zod';
import { WorkspaceRole } from '../enums/workspace-role.enum';
import { CurrencyCode } from '../canonical/currency';

export const WorkspaceRoleSchema = z.nativeEnum(WorkspaceRole);

export const CreateWorkspaceSchema = z.object({
  name: z
    .string()
    .min(2, 'Workspace name must be at least 2 characters')
    .max(100, 'Workspace name cannot exceed 100 characters'),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(100, 'Slug cannot exceed 100 characters')
    .regex(
      /^[a-z0-9-]+$/,
      'Slug must contain only lowercase alphanumeric characters and hyphens',
    )
    .optional(),
  baseCurrency: z.nativeEnum(CurrencyCode).default(CurrencyCode.USD),
});

export const UpdateWorkspaceSchema = z.object({
  name: z
    .string()
    .min(2, 'Workspace name must be at least 2 characters')
    .max(100, 'Workspace name cannot exceed 100 characters')
    .optional(),
  baseCurrency: z.nativeEnum(CurrencyCode).optional(),
});

export const AddWorkspaceMemberSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: WorkspaceRoleSchema.default(WorkspaceRole.MEDIA_BUYER),
});

export const UpdateMemberRoleSchema = z.object({
  role: WorkspaceRoleSchema,
});

export type CreateWorkspaceDto = z.infer<typeof CreateWorkspaceSchema>;
export type UpdateWorkspaceDto = z.infer<typeof UpdateWorkspaceSchema>;
export type AddWorkspaceMemberDto = z.infer<typeof AddWorkspaceMemberSchema>;
export type UpdateMemberRoleDto = z.infer<typeof UpdateMemberRoleSchema>;

export interface WorkspaceResponseDto {
  id: string;
  name: string;
  slug: string;
  baseCurrency: string;
  role?: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMemberResponseDto {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}
