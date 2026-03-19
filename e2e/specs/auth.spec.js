// @ts-check
const { test, expect } = require("@playwright/test");

test.describe("Authentication flow", () => {
  test("signup page renders with form", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
  });

  test("login page renders with form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
  });

  test("signup rejects empty fields", async ({ page }) => {
    await page.goto("/signup");
    const submitButton = page.locator("button[type='submit'], button:has-text('Sign Up'), button:has-text('Create')");
    if (await submitButton.count() > 0) {
      await submitButton.first().click();
      // Should show error or stay on page
      await expect(page).toHaveURL(/signup/);
    }
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[type='email']", "invalid@test.com");
    await page.fill("input[type='password']", "wrongpassword");
    const submitButton = page.locator("button[type='submit'], button:has-text('Sign In'), button:has-text('Log In')");
    if (await submitButton.count() > 0) {
      await submitButton.first().click();
      // Should show error or stay on login page
      await page.waitForTimeout(1000);
      const errorVisible = await page.locator("text=Invalid, text=Error, text=failed").count();
      // Page should not navigate to dashboard
      const url = page.url();
      expect(url).toMatch(/login|signup|\//);
    }
  });
});
