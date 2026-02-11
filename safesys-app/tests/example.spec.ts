import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
    await page.goto('/');

    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/KRC안전/i);
});

test('check login form visible', async ({ page }) => {
    await page.goto('/');
    // Check if login form is present
    await expect(page.getByRole('heading', { name: '안전관리 시스템' })).toBeVisible();
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
});
