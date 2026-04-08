import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3101",
    browserName: "chromium",
    viewport: {
      width: 360,
      height: 780,
    },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev:plain -- --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101/random-game",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
