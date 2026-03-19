// @ts-check
const { defineConfig, devices } = require("@playwright/test");

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

module.exports = defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  /* Start the full stack before tests if not already running */
  // webServer: {
  //   command: "docker compose up -d",
  //   url: BASE_URL,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120000,
  // },
});
