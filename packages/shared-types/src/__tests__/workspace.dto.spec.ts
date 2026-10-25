import {
  WorkspaceRole,
  CreateWorkspaceSchema,
  UpdateWorkspaceSchema,
  AddWorkspaceMemberSchema,
  UpdateMemberRoleSchema,
  CurrencyCode,
} from '../index';

describe('Workspace DTOs & Validation Schemas', () => {
  describe('WorkspaceRole Enum', () => {
    it('defines exactly the 5 RBAC roles', () => {
      const roles = Object.values(WorkspaceRole);
      expect(roles).toHaveLength(5);
      expect(roles).toContain(WorkspaceRole.OWNER);
      expect(roles).toContain(WorkspaceRole.ADMIN);
      expect(roles).toContain(WorkspaceRole.MEDIA_BUYER);
      expect(roles).toContain(WorkspaceRole.ANALYST);
      expect(roles).toContain(WorkspaceRole.CLIENT_VIEWER);
    });
  });

  describe('CreateWorkspaceSchema', () => {
    it('validates a valid workspace creation request with default baseCurrency', () => {
      const result = CreateWorkspaceSchema.safeParse({
        name: 'Acme Growth Agency',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Acme Growth Agency');
        expect(result.data.baseCurrency).toBe(CurrencyCode.USD);
      }
    });

    it('accepts explicit slug and baseCurrency', () => {
      const result = CreateWorkspaceSchema.safeParse({
        name: 'Riyadh Retail Media',
        slug: 'riyadh-retail-media',
        baseCurrency: CurrencyCode.SAR,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.slug).toBe('riyadh-retail-media');
        expect(result.data.baseCurrency).toBe(CurrencyCode.SAR);
      }
    });

    it('rejects names shorter than 2 characters', () => {
      const result = CreateWorkspaceSchema.safeParse({ name: 'A' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain(
          'at least 2 characters',
        );
      }
    });

    it('rejects names longer than 100 characters', () => {
      const longName = 'W'.repeat(101);
      const result = CreateWorkspaceSchema.safeParse({ name: longName });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain(
          'cannot exceed 100 characters',
        );
      }
    });

    it('rejects invalid slug format', () => {
      const invalidSlugs = [
        'Invalid Slug',
        'slug_with_underscore',
        'SlugUppercase',
        'slug!@#',
      ];
      for (const slug of invalidSlugs) {
        const result = CreateWorkspaceSchema.safeParse({
          name: 'Valid Name',
          slug,
        });
        expect(result.success).toBe(false);
      }
    });
  });

  describe('UpdateWorkspaceSchema', () => {
    it('allows updating only name', () => {
      const result = UpdateWorkspaceSchema.safeParse({
        name: 'Updated Workspace Name',
      });
      expect(result.success).toBe(true);
    });

    it('allows updating only baseCurrency', () => {
      const result = UpdateWorkspaceSchema.safeParse({
        baseCurrency: CurrencyCode.AED,
      });
      expect(result.success).toBe(true);
    });

    it('allows empty object for no-op update', () => {
      const result = UpdateWorkspaceSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('AddWorkspaceMemberSchema', () => {
    it('defaults role to MEDIA_BUYER if omitted', () => {
      const result = AddWorkspaceMemberSchema.safeParse({
        userId: 'usr_cuid12345',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe('usr_cuid12345');
        expect(result.data.role).toBe(WorkspaceRole.MEDIA_BUYER);
      }
    });

    it('accepts explicit role', () => {
      const result = AddWorkspaceMemberSchema.safeParse({
        userId: 'usr_admin999',
        role: WorkspaceRole.ADMIN,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe(WorkspaceRole.ADMIN);
      }
    });

    it('rejects missing or empty userId', () => {
      const empty = AddWorkspaceMemberSchema.safeParse({ userId: '' });
      expect(empty.success).toBe(false);

      const missing = AddWorkspaceMemberSchema.safeParse({});
      expect(missing.success).toBe(false);
    });
  });

  describe('UpdateMemberRoleSchema', () => {
    it('accepts valid role updates', () => {
      const result = UpdateMemberRoleSchema.safeParse({
        role: WorkspaceRole.CLIENT_VIEWER,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid roles', () => {
      const result = UpdateMemberRoleSchema.safeParse({
        role: 'SUPERUSER',
      });
      expect(result.success).toBe(false);
    });
  });
});
