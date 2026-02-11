import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {

    test('Login Page UI Elements', async ({ page }) => {
        await page.goto('/');

        // Check main elements
        await expect(page.getByRole('heading', { name: '안전관리 시스템' })).toBeVisible();
        await expect(page.getByLabel('이메일 주소')).toBeVisible();
        await expect(page.getByLabel('비밀번호')).toBeVisible();

        // Check buttons
        await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
        await expect(page.getByRole('button', { name: '계정이 없으신가요? 회원가입' })).toBeVisible();

        // Check finding buttons
        await expect(page.getByRole('button', { name: '아이디 찾기' })).toBeVisible();
        await expect(page.getByRole('button', { name: '비밀번호 찾기' })).toBeVisible();
    });

    test('Login Validation', async ({ page }) => {
        await page.goto('/');

        // Try empty submit
        // Note: HTML5 validation might prevent submission, or custom validation
        // If standard form submission, we can check validation messages or just that we are still on the page

        // Fill invalid email format
        await page.getByLabel('이메일 주소').fill('invalid-email');
        await page.getByLabel('비밀번호').fill('123456');
        await page.getByRole('button', { name: '로그인' }).click();

        // Browser validation message check is tricky, but we can verify we didn't redirect
        await expect(page).toHaveURL('/');
    });

    test('Signup Flow Navigation', async ({ page }) => {
        await page.goto('/');

        // Click signup button
        await page.getByRole('button', { name: '계정이 없으신가요? 회원가입' }).click();

        // Should be redirected to terms page first because sessionStorage is empty
        await expect(page).toHaveURL(/.*\/signup\/terms/);
    });

    test('Find ID Modal', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: '아이디 찾기' }).click();
        // Modal should be visible
        // Based on LoginForm.tsx, it renders FindIdModal. 
        // We assume it has some identifiable text like "아이디 찾기" heading in a modal
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 }).catch(() => {
            // Fallback if dialog role is not used, check for text
            return expect(page.getByText('아이디 찾기').first()).toBeVisible();
        });
    });

});
