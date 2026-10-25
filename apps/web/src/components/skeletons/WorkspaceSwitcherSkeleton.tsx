import * as React from 'react';
import { Skeleton } from '../ui/skeleton';

export function WorkspaceSwitcherSkeleton() {
  return (
    <div
      data-testid="workspace-switcher-skeleton"
      className="flex items-center gap-2 rounded-lg border border-border/80 px-3 py-1.5 h-9 w-48 sm:w-56"
    >
      <Skeleton className="h-6 w-6 rounded-md shrink-0" />
      <div className="flex flex-col gap-1 flex-1">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2 w-12" />
      </div>
      <Skeleton className="h-4 w-12 rounded-md shrink-0" />
    </div>
  );
}
