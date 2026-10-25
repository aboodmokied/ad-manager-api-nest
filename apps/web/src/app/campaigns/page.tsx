'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Search, RefreshCw, Pause, Play, RotateCcw } from 'lucide-react';
import {
  CampaignStatus,
  Platform,
  dollarsToMicros,
  formatMicros,
  CurrencyCode,
} from '@uacm/shared-types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CampaignListSkeleton } from '@/components/skeletons/CampaignListSkeleton';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { useDirection } from '@/components/providers/direction-provider';

interface CampaignRecord {
  id: string;
  name: string;
  platforms: Platform[];
  status: CampaignStatus;
  dailyBudgetMicros: bigint;
  totalBudgetMicros: bigint;
  clicks: number;
  conversions: number;
  spendMicros: bigint;
}

const INITIAL_CAMPAIGNS: CampaignRecord[] = [
  {
    id: 'cmp-101',
    name: 'Q4 Black Friday Omnichannel Conversions',
    platforms: [Platform.META, Platform.GOOGLE],
    status: CampaignStatus.LIVE,
    dailyBudgetMicros: dollarsToMicros(150),
    totalBudgetMicros: dollarsToMicros(4500),
    clicks: 12480,
    conversions: 842,
    spendMicros: dollarsToMicros(3240.5),
  },
  {
    id: 'cmp-102',
    name: 'MENA App Installs Scaling — Gulf Region',
    platforms: [Platform.META],
    status: CampaignStatus.LIVE,
    dailyBudgetMicros: dollarsToMicros(85),
    totalBudgetMicros: dollarsToMicros(2550),
    clicks: 8410,
    conversions: 415,
    spendMicros: dollarsToMicros(1120),
  },
  {
    id: 'cmp-103',
    name: 'Google RSA High-Intent Search Captures',
    platforms: [Platform.GOOGLE],
    status: CampaignStatus.PAUSED,
    dailyBudgetMicros: dollarsToMicros(50),
    totalBudgetMicros: dollarsToMicros(1500),
    clicks: 3120,
    conversions: 188,
    spendMicros: dollarsToMicros(790.2),
  },
  {
    id: 'cmp-104',
    name: 'Lead Generation Pre-Launch Campaign',
    platforms: [Platform.META, Platform.GOOGLE],
    status: CampaignStatus.DRAFT,
    dailyBudgetMicros: dollarsToMicros(30),
    totalBudgetMicros: dollarsToMicros(900),
    clicks: 0,
    conversions: 0,
    spendMicros: 0n,
  },
  {
    id: 'cmp-105',
    name: 'Automated Remarketing Retargeting Flow',
    platforms: [Platform.META],
    status: CampaignStatus.FAILED,
    dailyBudgetMicros: dollarsToMicros(40),
    totalBudgetMicros: dollarsToMicros(1200),
    clicks: 420,
    conversions: 12,
    spendMicros: dollarsToMicros(120),
  },
  {
    id: 'cmp-106',
    name: 'Brand Awareness Omnipresence — Ramadan Prep',
    platforms: [Platform.META, Platform.GOOGLE],
    status: CampaignStatus.PARTIALLY_LIVE,
    dailyBudgetMicros: dollarsToMicros(200),
    totalBudgetMicros: dollarsToMicros(6000),
    clicks: 9800,
    conversions: 320,
    spendMicros: dollarsToMicros(1840),
  },
];

export default function CampaignsPage() {
  const { activeWorkspace } = useWorkspace();
  const { isRtl } = useDirection();
  const [isLoading, setIsLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [campaigns, setCampaigns] =
    React.useState<CampaignRecord[]>(INITIAL_CAMPAIGNS);

  const currency =
    (activeWorkspace.baseCurrency as CurrencyCode) || CurrencyCode.USD;

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleCampaignStatus = (id: string) => {
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const newStatus =
            c.status === CampaignStatus.LIVE
              ? CampaignStatus.PAUSED
              : CampaignStatus.LIVE;
          return { ...c, status: newStatus };
        }
        return c;
      }),
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsLoading(false)}
            className="text-xs"
          >
            Switch to Loaded State
          </Button>
        </div>
        <CampaignListSkeleton />
      </div>
    );
  }

  return (
    <div
      className="space-y-6 animate-in fade-in-50 duration-200"
      data-testid="campaigns-page"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {isRtl ? 'الحملات الإعلانية الموحدة' : 'Unified Campaigns'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? `إدارة ونشر وتتبع الحملات عبر جميع المنصات في مساحة: ${activeWorkspace.name}`
              : `Manage, deploy, and inspect ad campaigns across platforms in ${activeWorkspace.name}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsLoading(true)}
            data-testid="toggle-campaigns-skeleton-btn"
            className="text-xs gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{isRtl ? 'محاكاة التحميل' : 'Simulate Loading'}</span>
          </Button>

          <Link href="/campaigns/new">
            <Button
              size="sm"
              className="gap-1.5 shadow-sm font-medium"
              data-testid="new-campaign-button"
            >
              <Plus className="h-4 w-4" />
              <span>{isRtl ? 'حملة جديدة' : 'New Campaign'}</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={
              isRtl ? 'البحث عن حملة أو معرف...' : 'Search campaigns or ID...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ps-9 h-9 text-sm"
            data-testid="campaign-search-input"
          />
        </div>

        {/* Status Filter Buttons */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0"
          data-testid="status-filters"
        >
          {[
            'ALL',
            CampaignStatus.LIVE,
            CampaignStatus.PAUSED,
            CampaignStatus.DRAFT,
            CampaignStatus.FAILED,
          ].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition border ${
                statusFilter === status
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent'
              }`}
              data-testid={`filter-${status.toLowerCase()}`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Campaigns Table */}
      <Card className="p-6">
        <div className="overflow-x-auto">
          <table
            className="w-full text-start text-sm"
            data-testid="campaigns-table"
          >
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-3 text-start font-medium">
                  {isRtl ? 'اسم الحملة' : 'Campaign Name'}
                </th>
                <th className="pb-3 text-start font-medium">
                  {isRtl ? 'المنصات' : 'Platforms'}
                </th>
                <th className="pb-3 text-start font-medium">
                  {isRtl ? 'الحالة' : 'Status'}
                </th>
                <th className="pb-3 text-start font-medium">
                  {isRtl ? 'الميزانية اليومية' : 'Daily Budget'}
                </th>
                <th className="pb-3 text-start font-medium">
                  {isRtl ? 'إجمالي الميزانية' : 'Total Budget'}
                </th>
                <th className="pb-3 text-start font-medium">
                  {isRtl ? 'الإنفاق' : 'Spend'}
                </th>
                <th className="pb-3 text-end font-medium">
                  {isRtl ? 'الإجراءات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredCampaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {isRtl
                      ? 'لا توجد حملات تطابق البحث'
                      : 'No campaigns match your search.'}
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((camp) => (
                  <tr key={camp.id} className="hover:bg-accent/40 transition">
                    <td className="py-3.5 pe-4">
                      <div className="font-medium text-foreground">
                        {camp.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {camp.id}
                      </div>
                    </td>
                    <td className="py-3.5 pe-4">
                      <div className="flex gap-1 flex-wrap">
                        {camp.platforms.map((p) => (
                          <span
                            key={p}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground border border-border"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 pe-4">
                      <Badge status={camp.status}>{camp.status}</Badge>
                    </td>
                    <td className="py-3.5 pe-4 font-mono text-xs">
                      {formatMicros(camp.dailyBudgetMicros, currency)}
                    </td>
                    <td className="py-3.5 pe-4 font-mono text-xs">
                      {formatMicros(camp.totalBudgetMicros, currency)}
                    </td>
                    <td className="py-3.5 pe-4 font-mono text-xs">
                      {formatMicros(camp.spendMicros, currency)}
                    </td>
                    <td className="py-3.5 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        {camp.status === CampaignStatus.LIVE ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleCampaignStatus(camp.id)}
                            className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                            title="Pause Campaign"
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        ) : camp.status === CampaignStatus.PAUSED ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleCampaignStatus(camp.id)}
                            className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                            title="Resume Campaign"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        ) : camp.status === CampaignStatus.FAILED ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-sky-600 hover:text-sky-700 hover:bg-sky-500/10"
                            title="Retry Failed Platform"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
