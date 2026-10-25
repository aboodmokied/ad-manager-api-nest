'use client';

import * as React from 'react';
import { WorkspaceRole, CurrencyCode } from '@uacm/shared-types';

export interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  baseCurrency: CurrencyCode;
  role: WorkspaceRole;
}

export const INITIAL_WORKSPACES: WorkspaceItem[] = [
  {
    id: 'ws-main-001',
    name: 'Default Agency HQ',
    slug: 'default-agency-hq',
    baseCurrency: CurrencyCode.USD,
    role: WorkspaceRole.OWNER,
  },
  {
    id: 'ws-mena-002',
    name: 'MENA E-Commerce Growth',
    slug: 'mena-ecommerce-growth',
    baseCurrency: CurrencyCode.SAR,
    role: WorkspaceRole.ADMIN,
  },
  {
    id: 'ws-emea-003',
    name: 'EMEA Retail Ventures',
    slug: 'emea-retail-ventures',
    baseCurrency: CurrencyCode.EUR,
    role: WorkspaceRole.MEDIA_BUYER,
  },
];

interface WorkspaceContextType {
  workspaces: WorkspaceItem[];
  activeWorkspace: WorkspaceItem;
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
  addWorkspace: (workspace: WorkspaceItem) => void;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
}

const WorkspaceContext = React.createContext<WorkspaceContextType | undefined>(
  undefined,
);

const STORAGE_KEY_WS = 'x-workspace-id';

export function WorkspaceProvider({
  children,
  initialWorkspaces = INITIAL_WORKSPACES,
  defaultWorkspaceId,
}: {
  children: React.ReactNode;
  initialWorkspaces?: WorkspaceItem[];
  defaultWorkspaceId?: string;
}) {
  const [workspaces, setWorkspaces] =
    React.useState<WorkspaceItem[]>(initialWorkspaces);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = React.useState<string>(
    () => {
      return defaultWorkspaceId || initialWorkspaces[0]?.id || '';
    },
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  // Initialize from localStorage
  React.useEffect(() => {
    try {
      const savedId = localStorage.getItem(STORAGE_KEY_WS);
      if (savedId && workspaces.some((w) => w.id === savedId)) {
        setActiveWorkspaceIdState(savedId);
      } else if (workspaces[0]) {
        localStorage.setItem(STORAGE_KEY_WS, workspaces[0].id);
      }
    } catch {
      // Ignore
    }
  }, [workspaces]);

  const setActiveWorkspaceId = React.useCallback((id: string) => {
    setActiveWorkspaceIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY_WS, id);
    } catch {
      // Ignore
    }
  }, []);

  const addWorkspace = React.useCallback(
    (newWs: WorkspaceItem) => {
      setWorkspaces((prev) => [...prev, newWs]);
      setActiveWorkspaceId(newWs.id);
      setIsCreateModalOpen(false);
    },
    [setActiveWorkspaceId],
  );

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ||
    workspaces[0] ||
    INITIAL_WORKSPACES[0];

  const value = React.useMemo(
    () => ({
      workspaces,
      activeWorkspace,
      activeWorkspaceId: activeWorkspace.id,
      setActiveWorkspaceId,
      addWorkspace,
      isCreateModalOpen,
      setIsCreateModalOpen,
    }),
    [
      workspaces,
      activeWorkspace,
      setActiveWorkspaceId,
      addWorkspace,
      isCreateModalOpen,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextType {
  const ctx = React.useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
