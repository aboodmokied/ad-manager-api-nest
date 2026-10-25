'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Megaphone,
  TrendingUp,
  DollarSign,
  Users,
  Plus,
  RefreshCw,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import {
  CampaignStatus,
  Platform,
  dollarsToMicros,
  formatMicros,
  CurrencyCode,
} from '@uacm/shared-types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DashboardSkeleton } from '@/components/skeletons/DashboardSkeleton';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { useDirection } from '@/components/providers/direction-provider';

interface DashboardCampaign {
  id: string;
  name: string;
  platforms: Platform[];
  status: CampaignStatus;
  dailyBudgetMicros: bigint;
  spendMicros: bigint;
  conversions: number;
  updatedAt: string;
}

const SAMPLE_DASHBOARD_CAMPAIGNS: DashboardCampaign[] = [
  {
    id: 'cmp-001',
    name: 'Q4 Black Friday Omnichannel Conversions',
    platforms: [Platform.META, Platform.GOOGLE],
    status: CampaignStatus.LIVE,
    dailyBudgetMicros: dollarsToMicros(150),
    spendMicros: dollarsToMicros(3240.5),
    conversions: 842,
    updatedAt: '2026-10-24 18:30 UTC',
  },
  {
    id: 'cmp-002',
    name: 'MENA App Installs Scaling — Gulf Region',
    platforms: [Platform.META],
    status: CampaignStatus.LIVE,
    dailyBudgetMicros: dollarsToMicros(85),
    spendMicros: dollarsToMicros(1120),
    conversions: 415,
    updatedAt: '2026-10-24 16:15 UTC',
  },
  {
    id: 'cmp-003',
    name: 'Google RSA High-Intent Search Captures',
    platforms: [Platform.GOOGLE],
    status: CampaignStatus.PAUSED,
    dailyBudgetMicros: dollarsToMicros(50),
    spendMicros: dollarsToMicros(790.2),
    conversions: 188,
    updatedAt: '2026-10-23 20:00 UTC',
  },
  {
    id: 'cmp-004',
    name: 'Lead Generation Pre-Launch Campaign',
    platforms: [Platform.META, Platform.GOOGLE],
    status: CampaignStatus.DRAFT,
    dailyBudgetMicros: dollarsToMicros(30),
    spendMicros: 0n,
    conversions: 0,
    updatedAt: '2026-10-22 14:00 UTC',
  },
  {
    id: 'cmp-005',
    name: 'Automated Remarketing Retargeting Flow',
    platforms: [Platform.META],
    status: CampaignStatus.FAILED,
    dailyBudgetMicros: dollarsToMicros(40),
    spendMicros: dollarsToMicros(120),
    conversions: 12,
    updatedAt: '2026-10-21 11:45 UTC',
  },
];

export default function DashboardPage() {
  const { activeWorkspace } = useWorkspace();
  const { isRtl } = useDirection();
  const [isLoading, setIsLoading] = React.useState(false);

  const currency =
    (activeWorkspace.baseCurrency as CurrencyCode) || CurrencyCode.USD;

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
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div
      className="space-y-8 animate-in fade-in-50 duration-200"
      data-testid="dashboard-page"
    >
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>
              {isRtl ? 'نظرة عامة على الأداء' : 'Unified Performance Overview'}
            </span>
            <Sparkles className="h-5 w-5 text-primary" />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? `مساحة العمل النشطة: ${activeWorkspace.name} (${activeWorkspace.baseCurrency})`
              : `Active Workspace: ${activeWorkspace.name} (${activeWorkspace.baseCurrency})`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsLoading(true)}
            data-testid="toggle-skeleton-btn"
            className="text-xs gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{isRtl ? 'محاكاة التحميل' : 'Simulate Loading'}</span>
          </Button>

          <Link href="/campaigns/new">
            <Button size="sm" className="gap-1.5 font-medium shadow-sm">
              <Plus className="h-4 w-4" />
              <span>{isRtl ? 'حملة جديدة' : 'New Campaign'}</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* 4 Metric Summary Cards */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        data-testid="metric-cards"
      >
        <Card className="h-32 flex flex-col justify-between p-6 hover:border-primary/50 transition">
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">
              {isRtl ? 'الحملات النشطة' : 'Active Campaigns'}
            </span>
            <Megaphone className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              2 / 5
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isRtl
                ? '40% من الحملات قيد التشغيل'
                : '40% active live delivery'}
            </p>
          </div>
        </Card>

        <Card className="h-32 flex flex-col justify-between p-6 hover:border-primary/50 transition">
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">
              {isRtl ? 'إجمالي الصرف' : 'Total Spend'}
            </span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
              {formatMicros(dollarsToMicros(5270.7), currency)}
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>
                +18.4% {isRtl ? 'مقارنة بالأسبوع الماضي' : 'vs last 7 days'}
              </span>
            </p>
          </div>
        </Card>

        <Card className="h-32 flex flex-col justify-between p-6 hover:border-primary/50 transition">
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">
              {isRtl ? 'الإحالات الناجحة' : 'Total Conversions'}
            </span>
            <Users className="h-4 w-4 text-sky-500" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
              1,457
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              CPA: {formatMicros(dollarsToMicros(3.61), currency)}
            </p>
          </div>
        </Card>

        <Card className="h-32 flex flex-col justify-between p-6 hover:border-primary/50 transition">
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">
              {isRtl ? 'معدل النقر (CTR)' : 'Average CTR'}
            </span>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
              3.82%
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              38,420 {isRtl ? 'نقرة مسجلة' : 'tracked link clicks'}
            </p>
          </div>
        </Card>
      </div>

      {/* Recent Campaigns Table */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {isRtl
                ? 'أحدث الحملات الإعلانية'
                : 'Recent Multi-Platform Campaigns'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isRtl
                ? 'متابعة الحملات النشطة وحالات النشر عبر Meta و Google Ads'
                : 'Monitor active delivery across Meta and Google Ads engines'}
            </p>
          </div>
          <Link href="/campaigns">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 text-primary"
            >
              <span>{isRtl ? 'عرض كل الحملات' : 'View All Campaigns'}</span>
              <ArrowUpRight className="h-3.5 w-3.5 rtl:rotate-90" />
            </Button>
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table
            className="w-full text-start text-sm"
            data-testid="dashboard-campaigns-table"
          >
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-3 text-start font-medium">
                  {isRtl ? 'اسم الحملة' : 'Campaign'}
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
                  {isRtl ? 'الإنفاق' : 'Spend'}
                </th>
                <th className="pb-3 text-end font-medium">
                  {isRtl ? 'الإجراء' : 'Action'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {SAMPLE_DASHBOARD_CAMPAIGNS.map((camp) => (
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
                    <div className="flex gap-1.5 flex-wrap">
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
                    <Badge
                      status={camp.status}
                      data-testid={`status-${camp.status.toLowerCase()}`}
                    >
                      {camp.status}
                    </Badge>
                  </td>
                  <td className="py-3.5 pe-4 font-mono text-xs">
                    {formatMicros(camp.dailyBudgetMicros, currency)}
                  </td>
                  <td className="py-3.5 pe-4 font-mono text-xs">
                    {formatMicros(camp.spendMicros, currency)}
                  </td>
                  <td className="py-3.5 text-end">
                    <Link href={`/campaigns`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                      >
                        {isRtl ? 'تفاصيل' : 'Details'}
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
