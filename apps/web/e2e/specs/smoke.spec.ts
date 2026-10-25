import { test, expect } from '@playwright/test';
import { CampaignBuilderPage } from '../pages/campaign-builder.page';

test.describe('UACM App Smoke & Navigation Tests', () => {
  test('يجب أن تفتح الصفحة الرئيسية للوحة التحكم بنجاح مع دعم RTL', async ({ page }) => {
    await page.goto('/');

    // التحقق من عنوان الصفحة والمحتوى الأساسي
    await expect(page).toHaveTitle(/UACM/i);

    // التحقق من تفعيل اتجاه RTL الافتراضي للغة العربية
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');
  });

  test('يجب أن ينتقل المستخدم إلى صفحة مساحات العمل بنجاح', async ({ page }) => {
    await page.goto('/workspaces');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('يجب أن تفتح صفحة إنشاء الحملة الموحدة بنجاح', async ({ page }) => {
    const builderPage = new CampaignBuilderPage(page);
    await builderPage.goto();
    await builderPage.verifyLoaded();
  });
});
