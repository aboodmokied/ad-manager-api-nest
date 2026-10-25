'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Megaphone,
  Building2,
  Link2,
  BarChart3,
  Settings,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDirection } from '../providers/direction-provider';

export interface NavItem {
  title: string;
  titleAr: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  {
    title: 'Dashboard',
    titleAr: 'لوحة التحكم',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Campaigns',
    titleAr: 'الحملات الإعلانية',
    href: '/campaigns',
    icon: Megaphone,
  },
  {
    title: 'Workspaces',
    titleAr: 'مساحات العمل',
    href: '/workspaces',
    icon: Building2,
  },
  {
    title: 'Connected Accounts',
    titleAr: 'الحسابات المتصلة',
    href: '/connected-accounts',
    icon: Link2,
  },
  {
    title: 'Analytics',
    titleAr: 'التحليلات والأداء',
    href: '/analytics',
    icon: BarChart3,
  },
  {
    title: 'Settings',
    titleAr: 'الإعدادات',
    href: '/settings',
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isRtl } = useDirection();

  return (
    <aside
      className="flex flex-col w-64 border-e border-border/80 bg-card/60 backdrop-blur-md min-h-screen select-none shrink-0"
      aria-label="Sidebar Navigation"
    >
      {/* Brand Logo Header */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-border/80">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-base tracking-tight text-foreground">
            UACM
          </span>
          <span className="text-[11px] text-muted-foreground font-medium">
            Multi-Platform Ads
          </span>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-colors',
                  isActive
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <span className="truncate">
                {isRtl ? item.titleAr : item.title}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Info / Version */}
      <div className="p-4 border-t border-border/80 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground/80">Sprint 1 MVP</span>
          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
            v0.1.0
          </span>
        </div>
        <p className="mt-1 text-[11px] opacity-75">Meta & Google Ads Engine</p>
      </div>
    </aside>
  );
}
