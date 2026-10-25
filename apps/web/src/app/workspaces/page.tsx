'use client';

import * as React from 'react';
import {
  Building2,
  Plus,
  Users,
  CheckCircle,
  Mail,
  UserCheck,
} from 'lucide-react';
import { WorkspaceRole } from '@uacm/shared-types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useWorkspace,
  WorkspaceItem,
} from '@/components/providers/workspace-provider';
import { useDirection } from '@/components/providers/direction-provider';

interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
}

const SAMPLE_MEMBERS: WorkspaceMember[] = [
  {
    id: 'usr-1',
    name: 'Karim Al-Husseini',
    email: 'karim@agency.io',
    role: WorkspaceRole.OWNER,
    joinedAt: '2026-01-10',
  },
  {
    id: 'usr-2',
    name: 'Sarah Jenkins',
    email: 'sarah@agency.io',
    role: WorkspaceRole.ADMIN,
    joinedAt: '2026-02-15',
  },
  {
    id: 'usr-3',
    name: 'Tarek Mansour',
    email: 'tarek@agency.io',
    role: WorkspaceRole.MEDIA_BUYER,
    joinedAt: '2026-03-01',
  },
  {
    id: 'usr-4',
    name: 'Elena Rostova',
    email: 'elena@agency.io',
    role: WorkspaceRole.ANALYST,
    joinedAt: '2026-04-12',
  },
  {
    id: 'usr-5',
    name: 'David Chen',
    email: 'client@partner.com',
    role: WorkspaceRole.CLIENT_VIEWER,
    joinedAt: '2026-05-20',
  },
];

export default function WorkspacesPage() {
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    setIsCreateModalOpen,
  } = useWorkspace();
  const { isRtl } = useDirection();

  return (
    <div
      className="space-y-8 animate-in fade-in-50 duration-200"
      data-testid="workspaces-page"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {isRtl ? 'إدارة مساحات العمل' : 'Workspace Management'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRtl
              ? 'عزل الحسابات الإعلانية وتعيين الصلاحيات وإدارة العملات الأساسية'
              : 'Isolate ad accounts, manage multi-tenant RBAC permissions, and configure currencies'}
          </p>
        </div>

        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="gap-1.5 shadow-sm font-medium"
          data-testid="create-workspace-page-btn"
        >
          <Plus className="h-4 w-4" />
          <span>{isRtl ? 'إنشاء مساحة عمل جديدة' : 'Create Workspace'}</span>
        </Button>
      </div>

      {/* Workspaces Grid */}
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
        data-testid="workspaces-grid"
      >
        {workspaces.map((ws: WorkspaceItem) => {
          const isActive = ws.id === activeWorkspaceId;
          return (
            <Card
              key={ws.id}
              className={`p-6 cursor-pointer transition relative flex flex-col justify-between ${
                isActive
                  ? 'border-primary shadow-md bg-accent/20'
                  : 'hover:border-primary/50'
              }`}
              onClick={() => setActiveWorkspaceId(ws.id)}
              data-testid={`workspace-card-${ws.id}`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  {isActive && (
                    <Badge variant="default" className="text-[10px] gap-1">
                      <CheckCircle className="h-3 w-3" />
                      <span>{isRtl ? 'النشطة' : 'Active'}</span>
                    </Badge>
                  )}
                </div>

                <h3 className="font-semibold text-base text-foreground truncate">
                  {ws.name}
                </h3>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {ws.slug}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/80">
                <span className="text-xs font-semibold text-muted-foreground font-mono">
                  {ws.baseCurrency}
                </span>
                <Badge role={ws.role}>{ws.role}</Badge>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Active Workspace Member Roster */}
      <Card className="p-6" data-testid="workspace-members-card">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <span>
                {isRtl
                  ? `أعضاء مساحة: ${activeWorkspace.name}`
                  : `Team Members: ${activeWorkspace.name}`}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              {isRtl
                ? 'إدارة صلاحيات الوصول ومستوى التحكم في الحملات والميزانيات'
                : 'Manage RBAC role assignments across campaigns and media budgets'}
            </p>
          </div>
          <Button variant="outline" size="sm" className="text-xs gap-1">
            <Mail className="h-3.5 w-3.5" />
            <span>{isRtl ? 'دعوة عضو جديد' : 'Invite Member'}</span>
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table
            className="w-full text-start text-sm"
            data-testid="members-table"
          >
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-3 text-start font-medium">
                  {isRtl ? 'المستخدم' : 'Member'}
                </th>
                <th className="pb-3 text-start font-medium">
                  {isRtl ? 'البريد الإلكتروني' : 'Email'}
                </th>
                <th className="pb-3 text-start font-medium">
                  {isRtl ? 'الدور والصلاحية' : 'Role'}
                </th>
                <th className="pb-3 text-start font-medium">
                  {isRtl ? 'تاريخ الانضمام' : 'Joined Date'}
                </th>
                <th className="pb-3 text-end font-medium">
                  {isRtl ? 'الحالة' : 'Status'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {SAMPLE_MEMBERS.map((member) => (
                <tr key={member.id} className="hover:bg-accent/40 transition">
                  <td className="py-3.5 pe-4">
                    <div className="font-medium text-foreground">
                      {member.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {member.id}
                    </div>
                  </td>
                  <td className="py-3.5 pe-4 text-xs font-mono text-muted-foreground">
                    {member.email}
                  </td>
                  <td className="py-3.5 pe-4">
                    <Badge role={member.role}>{member.role}</Badge>
                  </td>
                  <td className="py-3.5 pe-4 text-xs text-muted-foreground">
                    {member.joinedAt}
                  </td>
                  <td className="py-3.5 text-end">
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>Active</span>
                    </span>
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
