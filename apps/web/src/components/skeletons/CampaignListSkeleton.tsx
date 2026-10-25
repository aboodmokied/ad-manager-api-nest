import * as React from 'react';
import { Skeleton } from '../ui/skeleton';
import { Card } from '../ui/card';

export function CampaignListSkeleton() {
  return (
    <div data-testid="campaign-list-skeleton" className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <Skeleton className="h-9 w-full sm:w-72 rounded-md" />
        <div className="flex gap-2 w-full sm:w-auto">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>

      {/* Table Card */}
      <Card className="p-6">
        <div className="space-y-4">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 pb-3 border-b border-border text-xs">
            <div className="col-span-4">
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="col-span-2">
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="col-span-2">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="col-span-2">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="col-span-2 flex justify-end">
              <Skeleton className="h-4 w-16" />
            </div>
          </div>

          {/* Table Rows (6 rows) */}
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-4 py-3 border-b border-border/40 items-center"
            >
              <div className="col-span-4 flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <div className="space-y-1 min-w-0">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="col-span-2 flex gap-1">
                <Skeleton className="h-5 w-14 rounded-md" />
                <Skeleton className="h-5 w-14 rounded-md" />
              </div>
              <div className="col-span-2">
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="col-span-2 space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
