import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { CampaignStatus, WorkspaceRole } from '@uacm/shared-types';

export const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
        outline: 'text-foreground',
        success:
          'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20',
        warning:
          'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20',
        info: 'border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/20',
        purple:
          'border-transparent bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export function getCampaignStatusBadgeVariant(
  status: CampaignStatus,
): VariantProps<typeof badgeVariants>['variant'] {
  switch (status) {
    case CampaignStatus.LIVE:
      return 'success';
    case CampaignStatus.PAUSED:
      return 'warning';
    case CampaignStatus.PARTIALLY_LIVE:
      return 'warning';
    case CampaignStatus.FAILED:
      return 'destructive';
    case CampaignStatus.DRAFT:
      return 'secondary';
    case CampaignStatus.PRE_VALIDATING:
    case CampaignStatus.PROCESSING_MEDIA:
    case CampaignStatus.QUEUED_FOR_PUBLISH:
      return 'info';
    default:
      return 'outline';
  }
}

export function getWorkspaceRoleBadgeVariant(
  role: WorkspaceRole,
): VariantProps<typeof badgeVariants>['variant'] {
  switch (role) {
    case WorkspaceRole.OWNER:
      return 'purple';
    case WorkspaceRole.ADMIN:
      return 'default';
    case WorkspaceRole.MEDIA_BUYER:
      return 'success';
    case WorkspaceRole.ANALYST:
      return 'warning';
    case WorkspaceRole.CLIENT_VIEWER:
      return 'secondary';
    default:
      return 'outline';
  }
}

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  status?: CampaignStatus;
  role?: WorkspaceRole;
}

export function Badge({
  className,
  variant,
  status,
  role,
  children,
  ...props
}: BadgeProps) {
  let resolvedVariant = variant;
  if (status) {
    resolvedVariant = getCampaignStatusBadgeVariant(status);
  } else if (role) {
    resolvedVariant = getWorkspaceRoleBadgeVariant(role);
  }

  return (
    <div
      className={cn(badgeVariants({ variant: resolvedVariant }), className)}
      {...props}
    >
      {children || status || role}
    </div>
  );
}
