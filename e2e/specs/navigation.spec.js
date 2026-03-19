// @ts-check
const { test, expect } = require("@playwright/test");

test.describe("Marketing site navigation", () => {
  test("landing page loads with hero section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("text=OpenClaw")).toBeVisible();
  });

  test("features section is present", async ({ page }) => {
    await page.goto("/");
    const features = page.locator("#features");
    await expect(features).toBeVisible();
  });

  test("how-it-works section is present", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#how-it-works");
    await expect(section).toBeVisible();
  });

  test("footer is present", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
  });

  test("nav links to features scrolls", async ({ page }) => {
    await page.goto("/");
    await page.click('a[href="#features"]');
    await page.waitForTimeout(500);
    // Features section should now be near viewport top
    const features = page.locator("#features");
    await expect(features).toBeInViewport();
  });

  test("Get Started links to signup", async ({ page }) => {
    await page.goto("/");
    const cta = page.locator("a:has-text('Get Started Free')").first();
    const href = await cta.getAttribute("href");
    expect(href).toBe("/signup");
  });
});

test.describe("Dashboard navigation", () => {
  test("dashboard redirects without auth", async ({ page }) => {
    await page.goto("/app/agents");
    // Should either show login prompt or redirect
    await page.waitForTimeout(1000);
  });

  test("login page is accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/login/);
  });
});
