import { describe, it, expect, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  renderHook,
  act,
} from '@testing-library/react';
import React from 'react';
import {
  DirectionProvider,
  useDirection,
} from '../components/providers/direction-provider';
import {
  WorkspaceProvider,
  useWorkspace,
  WorkspaceItem,
} from '../components/providers/workspace-provider';
import { WorkspaceSwitcher } from '../components/layout/WorkspaceSwitcher';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
import { CampaignListSkeleton } from '../components/skeletons/CampaignListSkeleton';
import { WorkspaceSwitcherSkeleton } from '../components/skeletons/WorkspaceSwitcherSkeleton';
import {
  CreateCampaignFormSchema,
  HeadlineItemSchema,
  DescriptionItemSchema,
} from '../components/forms/CreateCampaignForm';
import {
  CreateWorkspaceSchema,
  WorkspaceRole,
  Platform,
  UnifiedCampaignObjective,
  CurrencyCode,
} from '@uacm/shared-types';

describe('Adversarial Challenge Suite — Milestone 4 (apps/web)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dir = '';
    document.documentElement.lang = '';
  });

  describe('1. DirectionProvider & RTL/LTR Layout Mirroring', () => {
    it('throws error when useDirection is used outside DirectionProvider', () => {
      expect(() => renderHook(() => useDirection())).toThrow(
        'useDirection must be used within a DirectionProvider',
      );
    });

    it('gracefully handles corrupted or invalid values in localStorage', () => {
      localStorage.setItem('uacm-dir', 'corrupted-direction');
      localStorage.setItem('uacm-locale', 'xyz-invalid');

      const { result } = renderHook(() => useDirection(), {
        wrapper: ({ children }) => (
          <DirectionProvider defaultDirection="rtl" defaultLocale="ar">
            {children}
          </DirectionProvider>
        ),
      });

      // Must remain at valid defaults (rtl/ar) without crashing
      expect(result.current.dir).toBe('rtl');
      expect(result.current.locale).toBe('ar');
      expect(result.current.isRtl).toBe(true);
    });

    it('handles rapid sequential direction toggling deterministically', () => {
      const { result } = renderHook(() => useDirection(), {
        wrapper: ({ children }) => (
          <DirectionProvider>{children}</DirectionProvider>
        ),
      });

      expect(result.current.dir).toBe('rtl');

      act(() => {
        result.current.toggleDirection();
      });
      expect(result.current.dir).toBe('ltr');
      expect(document.documentElement.dir).toBe('ltr');
      expect(localStorage.getItem('uacm-dir')).toBe('ltr');

      act(() => {
        result.current.toggleDirection();
      });
      expect(result.current.dir).toBe('rtl');
      expect(document.documentElement.dir).toBe('rtl');
      expect(localStorage.getItem('uacm-dir')).toBe('rtl');
    });

    it('synchronizes container div data-direction attribute with current direction', () => {
      const { container } = render(
        <DirectionProvider defaultDirection="rtl" defaultLocale="ar">
          <div>Content</div>
        </DirectionProvider>,
      );

      const wrapperDiv = container.firstChild as HTMLElement;
      expect(wrapperDiv.getAttribute('dir')).toBe('rtl');
      expect(wrapperDiv.getAttribute('data-direction')).toBe('rtl');
    });
  });

  describe('2. WorkspaceSwitcher & Multi-Tenant State Isolation', () => {
    it('throws error when useWorkspace is used outside WorkspaceProvider', () => {
      expect(() => renderHook(() => useWorkspace())).toThrow(
        'useWorkspace must be used within a WorkspaceProvider',
      );
    });

    it('resets to default workspace when localStorage contains stale/non-existent workspace ID', () => {
      localStorage.setItem('x-workspace-id', 'ws-deleted-and-gone-999');

      const { result } = renderHook(() => useWorkspace(), {
        wrapper: ({ children }) => (
          <WorkspaceProvider>{children}</WorkspaceProvider>
        ),
      });

      // Upon checking localStorage, the stale ID should be replaced by the valid first workspace
      expect(result.current.activeWorkspace.id).toBe('ws-main-001');
      expect(localStorage.getItem('x-workspace-id')).toBe('ws-main-001');
    });

    it('correctly supports and displays all 5 RBAC roles across workspaces', () => {
      const customWorkspaces: WorkspaceItem[] = [
        {
          id: 'ws-owner',
          name: 'Owner Workspace',
          slug: 'owner-ws',
          baseCurrency: CurrencyCode.USD,
          role: WorkspaceRole.OWNER,
        },
        {
          id: 'ws-admin',
          name: 'Admin Workspace',
          slug: 'admin-ws',
          baseCurrency: CurrencyCode.EUR,
          role: WorkspaceRole.ADMIN,
        },
        {
          id: 'ws-buyer',
          name: 'Media Buyer Workspace',
          slug: 'buyer-ws',
          baseCurrency: CurrencyCode.SAR,
          role: WorkspaceRole.MEDIA_BUYER,
        },
        {
          id: 'ws-analyst',
          name: 'Analyst Workspace',
          slug: 'analyst-ws',
          baseCurrency: CurrencyCode.AED,
          role: WorkspaceRole.ANALYST,
        },
        {
          id: 'ws-viewer',
          name: 'Client Viewer Workspace',
          slug: 'viewer-ws',
          baseCurrency: CurrencyCode.GBP,
          role: WorkspaceRole.CLIENT_VIEWER,
        },
      ];

      render(
        <WorkspaceProvider initialWorkspaces={customWorkspaces}>
          <WorkspaceSwitcher />
        </WorkspaceProvider>,
      );

      // Initially OWNER
      expect(screen.getByTestId('user-role-badge')).toHaveTextContent('OWNER');

      // Open dropdown
      fireEvent.click(screen.getByTestId('workspace-switcher-trigger'));

      // Switch to MEDIA_BUYER
      fireEvent.click(screen.getByTestId('workspace-item-ws-buyer'));
      expect(screen.getByTestId('user-role-badge')).toHaveTextContent(
        'MEDIA_BUYER',
      );
      expect(localStorage.getItem('x-workspace-id')).toBe('ws-buyer');

      // Switch to CLIENT_VIEWER
      fireEvent.click(screen.getByTestId('workspace-switcher-trigger'));
      fireEvent.click(screen.getByTestId('workspace-item-ws-viewer'));
      expect(screen.getByTestId('user-role-badge')).toHaveTextContent(
        'CLIENT_VIEWER',
      );
      expect(localStorage.getItem('x-workspace-id')).toBe('ws-viewer');
    });

    it('adds dynamic workspace, makes it active, and persists to localStorage', () => {
      const { result } = renderHook(() => useWorkspace(), {
        wrapper: ({ children }) => (
          <WorkspaceProvider>{children}</WorkspaceProvider>
        ),
      });

      const newWs: WorkspaceItem = {
        id: 'ws-brand-new-777',
        name: 'Brand New Test Agency',
        slug: 'brand-new-test-agency',
        baseCurrency: CurrencyCode.SAR,
        role: WorkspaceRole.OWNER,
      };

      act(() => {
        result.current.addWorkspace(newWs);
      });

      expect(result.current.activeWorkspace.id).toBe('ws-brand-new-777');
      expect(result.current.activeWorkspace.name).toBe('Brand New Test Agency');
      expect(localStorage.getItem('x-workspace-id')).toBe('ws-brand-new-777');
      expect(result.current.workspaces).toHaveLength(4);
    });
  });

  describe('3. CLS = 0 Skeleton Loaders Dimension Verification', () => {
    it('verifies DashboardSkeleton matches exactly 4 metric cards with h-32', () => {
      const { container } = render(<DashboardSkeleton />);
      const metricCards = container.querySelectorAll('.grid > div');
      expect(metricCards).toHaveLength(4);
      metricCards.forEach((card) => {
        expect(card).toHaveClass('h-32');
        expect(card).toHaveClass('p-6');
      });
    });

    it('verifies CampaignListSkeleton provides matching table layout grid', () => {
      const { container } = render(<CampaignListSkeleton />);
      const rows = container.querySelectorAll('.grid-cols-12');
      // 1 header + 6 rows
      expect(rows.length).toBe(7);
      // Verify pulse animations on children
      const pulses = container.querySelectorAll('.animate-pulse');
      expect(pulses.length).toBeGreaterThan(20);
    });

    it('verifies WorkspaceSwitcherSkeleton matches exact trigger dimensions h-9 and padding', () => {
      render(<WorkspaceSwitcherSkeleton />);
      const skeleton = screen.getByTestId('workspace-switcher-skeleton');
      expect(skeleton).toHaveClass('h-9');
      expect(skeleton).toHaveClass('px-3');
      expect(skeleton).toHaveClass('py-1.5');
    });
  });

  describe('4. Zod Form Validation Stress-Testing', () => {
    it('boundary test: Google RSA headline character limit (30 chars max)', () => {
      // 30 chars - should pass
      const exact30 = '123456789012345678901234567890';
      expect(exact30.length).toBe(30);
      expect(HeadlineItemSchema.safeParse({ text: exact30 }).success).toBe(
        true,
      );

      // 31 chars - should fail
      const exceed31 = '1234567890123456789012345678901';
      expect(exceed31.length).toBe(31);
      const failResult = HeadlineItemSchema.safeParse({ text: exceed31 });
      expect(failResult.success).toBe(false);
      if (!failResult.success) {
        expect(failResult.error.issues[0].message).toBe(
          'Google headline cannot exceed 30 characters',
        );
      }
    });

    it('boundary test: Google RSA description character limit (90 chars max)', () => {
      // 90 chars - should pass
      const exact90 = 'A'.repeat(90);
      expect(DescriptionItemSchema.safeParse({ text: exact90 }).success).toBe(
        true,
      );

      // 91 chars - should fail
      const exceed91 = 'A'.repeat(91);
      const failResult = DescriptionItemSchema.safeParse({ text: exceed91 });
      expect(failResult.success).toBe(false);
      if (!failResult.success) {
        expect(failResult.error.issues[0].message).toBe(
          'Google description cannot exceed 90 characters',
        );
      }
    });

    it('rejects invalid budget inputs: negative, letters, exponential notation', () => {
      const baseValid = {
        name: 'Valid Campaign',
        objective: UnifiedCampaignObjective.AWARENESS,
        targetPlatforms: [Platform.META],
        googleOverrides: {
          headlines: [{ text: 'H1' }, { text: 'H2' }, { text: 'H3' }],
          descriptions: [{ text: 'D1' }, { text: 'D2' }],
        },
        metaOverrides: {
          specialAdCategory: 'NONE',
          placements: {
            facebookFeed: true,
            instagramFeed: true,
            instagramStories: true,
            reels: true,
          },
        },
      };

      // Negative budget
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '-50.00',
        }).success,
      ).toBe(false);

      // Letter input
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: 'abc',
        }).success,
      ).toBe(false);

      // Exponential notation
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '1e5',
        }).success,
      ).toBe(false);

      // More than 2 decimal places
      expect(
        CreateCampaignFormSchema.safeParse({
          ...baseValid,
          dailyBudgetDollars: '25.999',
        }).success,
      ).toBe(false);
    });

    it('validates Workspace creation schema with slug regex and currency enums', () => {
      // Valid input
      const validWs = CreateWorkspaceSchema.safeParse({
        name: 'Growth Agency EMEA',
        slug: 'growth-agency-emea',
        baseCurrency: CurrencyCode.EUR,
      });
      expect(validWs.success).toBe(true);

      // Invalid slug with spaces or uppercase
      const invalidSlug = CreateWorkspaceSchema.safeParse({
        name: 'Growth Agency EMEA',
        slug: 'Growth Agency',
        baseCurrency: CurrencyCode.EUR,
      });
      expect(invalidSlug.success).toBe(false);

      // Invalid currency
      const invalidCurrency = CreateWorkspaceSchema.safeParse({
        name: 'Growth Agency EMEA',
        slug: 'growth-agency-emea',
        baseCurrency: 'INVALID_CURRENCY',
      });
      expect(invalidCurrency.success).toBe(false);
    });
  });
});
