'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Globe, User, Moon, Sun, ChevronRight } from 'lucide-react';
import { useDirection } from '../providers/direction-provider';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { Button } from '../ui/button';

export function Header() {
  const pathname = usePathname();
  const { dir, locale, toggleDirection, isRtl } = useDirection();
  const [isDark, setIsDark] = React.useState(false);

  // Derive breadcrumb from pathname
  const getBreadcrumbs = () => {
    if (pathname === '/') {
      return [{ label: isRtl ? 'لوحة التحكم' : 'Dashboard', href: '/' }];
    }
    const parts = pathname.split('/').filter(Boolean);
    const crumbs = [{ label: isRtl ? 'الرئيسية' : 'Home', href: '/' }];
    let currentPath = '';

    for (const part of parts) {
      currentPath += `/${part}`;
      let label = part;
      if (part === 'campaigns')
        label = isRtl ? 'الحملات الإعلانية' : 'Campaigns';
      else if (part === 'new') label = isRtl ? 'إنشاء حملة' : 'New Campaign';
      else if (part === 'workspaces')
        label = isRtl ? 'مساحات العمل' : 'Workspaces';
      else if (part === 'connected-accounts')
        label = isRtl ? 'الحسابات المتصلة' : 'Connected Accounts';
      else if (part === 'analytics') label = isRtl ? 'التحليلات' : 'Analytics';
      crumbs.push({ label, href: currentPath });
    }
    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (typeof document !== 'undefined') {
      if (nextDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border/80 bg-background/80 px-6 backdrop-blur-md">
      {/* Left: Breadcrumbs & Workspace Switcher */}
      <div className="flex items-center gap-4">
        <WorkspaceSwitcher />

        <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground ms-2">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.href}>
              {idx > 0 && (
                <ChevronRight className="h-3 w-3 opacity-40 rtl:rotate-180" />
              )}
              <span
                className={
                  idx === breadcrumbs.length - 1
                    ? 'font-medium text-foreground'
                    : 'hover:text-foreground'
                }
              >
                {crumb.label}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Right: Actions (Language, Theme, User) */}
      <div className="flex items-center gap-2">
        {/* Language & RTL Toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleDirection}
          data-testid="direction-toggle-btn"
          className="flex items-center gap-1.5 h-8 text-xs font-semibold px-2.5"
          title={isRtl ? 'Switch to English' : 'التحويل إلى العربية'}
        >
          <Globe className="h-3.5 w-3.5" />
          <span>{locale.toUpperCase()}</span>
          <span className="text-[10px] text-muted-foreground">
            ({dir.toUpperCase()})
          </span>
        </Button>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Toggle Theme"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* User Profile Badge */}
        <div className="flex items-center gap-2 ps-2 border-s border-border/80">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden lg:flex flex-col text-start">
            <span className="text-xs font-semibold leading-tight text-foreground">
              Lead Marketer
            </span>
            <span className="text-[10px] text-muted-foreground">
              engineer@uacm.io
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
