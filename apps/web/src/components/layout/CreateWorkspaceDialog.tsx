'use client';

import * as React from 'react';
import { useWorkspace } from '../providers/workspace-provider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { CreateWorkspaceForm } from '../forms/CreateWorkspaceForm';

export function CreateWorkspaceDialog() {
  const { isCreateModalOpen, setIsCreateModalOpen } = useWorkspace();

  return (
    <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Workspace</DialogTitle>
          <DialogDescription>
            Workspaces isolate ad accounts, team members, and campaign budgets.
          </DialogDescription>
        </DialogHeader>
        <CreateWorkspaceForm
          onSuccess={() => setIsCreateModalOpen(false)}
          onCancel={() => setIsCreateModalOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
