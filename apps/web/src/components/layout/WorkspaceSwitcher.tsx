'use client';

import * as React from 'react';
import { ChevronsUpDown, Check, Plus, Building2 } from 'lucide-react';
import { useWorkspace, WorkspaceItem } from '../providers/workspace-provider';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';

export function WorkspaceSwitcher() {
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    setIsCreateModalOpen,
  } = useWorkspace();

  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="workspace-switcher-trigger"
            className="flex items-center gap-2 rounded-lg border border-border/80 bg-background/95 px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <div className="flex flex-col text-start">
              <span className="text-xs font-semibold leading-tight text-foreground truncate max-w-[120px] sm:max-w-[160px]">
                {activeWorkspace?.name || 'Select Workspace'}
              </span>
              <span className="text-[10px] text-muted-foreground leading-none">
                {activeWorkspace?.baseCurrency}
              </span>
            </div>
            {activeWorkspace?.role && (
              <Badge
                role={activeWorkspace.role}
                className="text-[10px] py-0 px-1.5 ms-1"
                data-testid="user-role-badge"
              >
                {activeWorkspace.role}
              </Badge>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 ms-1 shrink-0" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64 p-1">
          <DropdownMenuLabel>
            Workspaces ({workspaces.length})
          </DropdownMenuLabel>
          <div className="max-h-56 overflow-y-auto">
            {workspaces.map((ws: WorkspaceItem) => {
              const isSelected = ws.id === activeWorkspaceId;
              return (
                <DropdownMenuItem
                  key={ws.id}
                  onClick={() => setActiveWorkspaceId(ws.id)}
                  data-testid={`workspace-item-${ws.id}`}
                  className="flex items-center justify-between py-2 cursor-pointer"
                >
                  <div className="flex flex-col text-start min-w-0 pe-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {ws.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {ws.slug} • {ws.baseCurrency}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge role={ws.role} className="text-[10px] py-0 px-1">
                      {ws.role}
                    </Badge>
                    {isSelected && (
                      <Check className="h-4 w-4 text-primary ms-1" />
                    )}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsCreateModalOpen(true)}
            data-testid="create-workspace-btn"
            className="flex items-center gap-2 text-primary font-medium cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Create New Workspace</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
