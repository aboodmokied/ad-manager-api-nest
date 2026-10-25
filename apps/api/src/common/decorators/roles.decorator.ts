import { SetMetadata } from '@nestjs/common';
import { WorkspaceRole } from '@uacm/shared-types';

export const ROLES_KEY = 'workspace_roles';

/**
 * Decorator to enforce required workspace roles on endpoints.
 * @param roles Array of WorkspaceRole required to access the endpoint
 */
export const Roles = (...roles: WorkspaceRole[]) =>
  SetMetadata(ROLES_KEY, roles);
