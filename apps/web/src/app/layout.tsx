import * as React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { DirectionProvider } from '@/components/providers/direction-provider';
import { WorkspaceProvider } from '@/components/providers/workspace-provider';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'UACM — Unified Multi-Platform Ad Manager',
  description:
    'Enterprise multi-platform campaign orchestrator for Meta & Google Ads.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        <DirectionProvider defaultDirection="rtl" defaultLocale="ar">
          <WorkspaceProvider>
            <AppShell>{children}</AppShell>
          </WorkspaceProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
