import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { WorkspaceProvider } from '../components/providers/workspace-provider';
import { WorkspaceSwitcher } from '../components/layout/WorkspaceSwitcher';

describe('WorkspaceSwitcher Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders active workspace name, base currency, and role badge', () => {
    render(
      <WorkspaceProvider>
        <WorkspaceSwitcher />
      </WorkspaceProvider>,
    );

    expect(screen.getByText('Default Agency HQ')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByTestId('user-role-badge')).toHaveTextContent('OWNER');
  });

  it('allows switching workspace and updates active selection and role badge', () => {
    render(
      <WorkspaceProvider>
        <WorkspaceSwitcher />
      </WorkspaceProvider>,
    );

    // Click trigger to open dropdown
    const trigger = screen.getByTestId('workspace-switcher-trigger');
    fireEvent.click(trigger);

    // Find and select the MENA workspace
    const menaWorkspaceItem = screen.getByTestId('workspace-item-ws-mena-002');
    expect(menaWorkspaceItem).toBeInTheDocument();
    fireEvent.click(menaWorkspaceItem);

    // Active workspace is now MENA E-Commerce Growth with SAR and ADMIN role
    expect(screen.getByText('MENA E-Commerce Growth')).toBeInTheDocument();
    expect(screen.getByText('SAR')).toBeInTheDocument();
    expect(screen.getByTestId('user-role-badge')).toHaveTextContent('ADMIN');
  });

  it('persists selected workspace ID into localStorage under "x-workspace-id"', () => {
    render(
      <WorkspaceProvider>
        <WorkspaceSwitcher />
      </WorkspaceProvider>,
    );

    const trigger = screen.getByTestId('workspace-switcher-trigger');
    fireEvent.click(trigger);

    const emeaWorkspaceItem = screen.getByTestId('workspace-item-ws-emea-003');
    fireEvent.click(emeaWorkspaceItem);

    expect(localStorage.getItem('x-workspace-id')).toBe('ws-emea-003');
  });

  it('renders "Create New Workspace" action button', () => {
    render(
      <WorkspaceProvider>
        <WorkspaceSwitcher />
      </WorkspaceProvider>,
    );

    const trigger = screen.getByTestId('workspace-switcher-trigger');
    fireEvent.click(trigger);

    expect(screen.getByTestId('create-workspace-btn')).toBeInTheDocument();
  });
});
