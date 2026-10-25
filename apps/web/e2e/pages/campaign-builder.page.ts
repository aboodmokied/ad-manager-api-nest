import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Campaign Builder page (`/campaigns/new`)
 */
export class CampaignBuilderPage {
  readonly page: Page;
  readonly pageContainer: Locator;
  readonly nameInput: Locator;
  readonly budgetInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.locator('[data-testid="new-campaign-page"]');
    this.nameInput = page.locator('input[name="name"], input#name');
    this.budgetInput = page.locator('input[name="dailyBudget"], input#dailyBudget');
    this.submitButton = page.locator('button[type="submit"]');
  }

  async goto() {
    await this.page.goto('/campaigns/new');
  }

  async verifyLoaded() {
    await expect(this.pageContainer).toBeVisible();
  }
}
