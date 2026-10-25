import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { WorkspaceProvider } from '../components/providers/workspace-provider';
import {
  CreateCampaignForm,
  CreateCampaignFormSchema,
} from '../components/forms/CreateCampaignForm';
import {
  Platform,
  UnifiedCampaignObjective,
  dollarsToMicros,
} from '@uacm/shared-types';

describe('CampaignForm Component & Zod Validation', () => {
  it('validates schema directly for valid campaign input', () => {
    const validData = {
      name: 'Black Friday 2026',
      objective: UnifiedCampaignObjective.LEAD_GENERATION,
      dailyBudgetDollars: '150.00',
      targetPlatforms: [Platform.META, Platform.GOOGLE],
      googleOverrides: {
        customerId: '123-456-7890',
        headlines: [
          { text: 'Headline 1' },
          { text: 'Headline 2' },
          { text: 'Headline 3' },
        ],
        descriptions: [{ text: 'Description 1' }, { text: 'Description 2' }],
      },
      metaOverrides: {
        adAccountId: 'act_123456789',
        specialAdCategory: 'NONE' as const,
        placements: {
          facebookFeed: true,
          instagramFeed: true,
          instagramStories: true,
          reels: true,
        },
      },
    };

    const result = CreateCampaignFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('rejects campaign names shorter than 3 characters', async () => {
    const parsed = CreateCampaignFormSchema.safeParse({
      name: 'AB',
      objective: UnifiedCampaignObjective.TRAFFIC,
      dailyBudgetDollars: '50.00',
      targetPlatforms: [Platform.META],
      googleOverrides: {
        headlines: [{ text: 'H1' }, { text: 'H2' }, { text: 'H3' }],
        descriptions: [{ text: 'D1' }, { text: 'D2' }],
      },
      metaOverrides: {
        specialAdCategory: 'NONE',
        placements: {
          facebookFeed: true,
          instagramFeed: true,
          instagramStories: true,
          reels: true,
        },
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const nameError = parsed.error.issues.find((i) => i.path[0] === 'name');
      expect(nameError?.message).toBe(
        'Campaign name must be at least 3 characters',
      );
    }
  });

  it('rejects invalid or zero budgets', () => {
    const invalidBudget = CreateCampaignFormSchema.safeParse({
      name: 'Valid Name',
      objective: UnifiedCampaignObjective.TRAFFIC,
      dailyBudgetDollars: '0.00',
      targetPlatforms: [Platform.META],
      googleOverrides: {
        headlines: [{ text: 'H1' }, { text: 'H2' }, { text: 'H3' }],
        descriptions: [{ text: 'D1' }, { text: 'D2' }],
      },
      metaOverrides: {
        specialAdCategory: 'NONE',
        placements: {
          facebookFeed: true,
          instagramFeed: true,
          instagramStories: true,
          reels: true,
        },
      },
    });

    expect(invalidBudget.success).toBe(false);
  });

  it('rejects Google RSA headlines exceeding 30 characters', () => {
    const longHeadline = 'A'.repeat(31);
    const parsed = CreateCampaignFormSchema.safeParse({
      name: 'Valid Name',
      objective: UnifiedCampaignObjective.TRAFFIC,
      dailyBudgetDollars: '50.00',
      targetPlatforms: [Platform.GOOGLE],
      googleOverrides: {
        headlines: [
          { text: longHeadline },
          { text: 'Valid Headline 2' },
          { text: 'Valid Headline 3' },
        ],
        descriptions: [{ text: 'D1' }, { text: 'D2' }],
      },
      metaOverrides: {
        specialAdCategory: 'NONE',
        placements: {
          facebookFeed: true,
          instagramFeed: true,
          instagramStories: true,
          reels: true,
        },
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const headlineError = parsed.error.issues.find(
        (i) => i.path.includes('headlines') && i.path.includes(0),
      );
      expect(headlineError?.message).toBe(
        'Google headline cannot exceed 30 characters',
      );
    }
  });

  it('rejects Google RSA descriptions exceeding 90 characters', () => {
    const longDescription = 'B'.repeat(91);
    const parsed = CreateCampaignFormSchema.safeParse({
      name: 'Valid Name',
      objective: UnifiedCampaignObjective.TRAFFIC,
      dailyBudgetDollars: '50.00',
      targetPlatforms: [Platform.GOOGLE],
      googleOverrides: {
        headlines: [
          { text: 'Valid Headline 1' },
          { text: 'Valid Headline 2' },
          { text: 'Valid Headline 3' },
        ],
        descriptions: [
          { text: longDescription },
          { text: 'Valid Description 2' },
        ],
      },
      metaOverrides: {
        specialAdCategory: 'NONE',
        placements: {
          facebookFeed: true,
          instagramFeed: true,
          instagramStories: true,
          reels: true,
        },
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const descError = parsed.error.issues.find(
        (i) => i.path.includes('descriptions') && i.path.includes(0),
      );
      expect(descError?.message).toBe(
        'Google description cannot exceed 90 characters',
      );
    }
  });

  it('submits valid form data and calculates BigInt micros correctly', async () => {
    const handleSubmitSuccess = vi.fn();

    render(
      <WorkspaceProvider>
        <CreateCampaignForm onSubmitSuccess={handleSubmitSuccess} />
      </WorkspaceProvider>,
    );

    const nameInput = screen.getByTestId('input-campaign-name');
    const budgetInput = screen.getByTestId('input-daily-budget');
    const submitBtn = screen.getByTestId('submit-campaign-btn');

    fireEvent.change(nameInput, {
      target: { value: 'Holiday Lead Engine 2026' },
    });
    fireEvent.change(budgetInput, { target: { value: '75.50' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmitSuccess).toHaveBeenCalledTimes(1);
    });

    const callResult = handleSubmitSuccess.mock.calls[0][0];
    expect(callResult.name).toBe('Holiday Lead Engine 2026');
    expect(callResult.dailyBudgetMicros).toBe(75_500_000n);
    expect(callResult.dailyBudgetMicros).toBe(dollarsToMicros(75.5));
  });
});
