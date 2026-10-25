import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Skeleton } from '../components/ui/skeleton';
import { WorkspaceSwitcherSkeleton } from '../components/skeletons/WorkspaceSwitcherSkeleton';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
import { CampaignListSkeleton } from '../components/skeletons/CampaignListSkeleton';

describe('CLS = 0 Skeleton Components', () => {
  it('renders base Skeleton with animate-pulse class', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const skeletonEl = container.firstChild as HTMLElement;
    expect(skeletonEl).toHaveClass('animate-pulse');
    expect(skeletonEl).toHaveClass('h-4');
    expect(skeletonEl).toHaveClass('w-20');
  });

  it('renders WorkspaceSwitcherSkeleton with matching header trigger dimensions', () => {
    render(<WorkspaceSwitcherSkeleton />);
    const skeleton = screen.getByTestId('workspace-switcher-skeleton');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveClass('h-9');
  });

  it('renders DashboardSkeleton with 4 metric cards and recent campaigns table', () => {
    render(<DashboardSkeleton />);
    const skeleton = screen.getByTestId('dashboard-skeleton');
    expect(skeleton).toBeInTheDocument();
    // 4 metric cards
    expect(skeleton.querySelectorAll('.h-32').length).toBe(4);
  });

  it('renders CampaignListSkeleton with filter bar and table rows', () => {
    render(<CampaignListSkeleton />);
    const skeleton = screen.getByTestId('campaign-list-skeleton');
    expect(skeleton).toBeInTheDocument();
    // 6 rows rendered
    const rows = skeleton.querySelectorAll('.grid-cols-12');
    // 1 header + 6 rows = 7
    expect(rows.length).toBe(7);
  });
});
