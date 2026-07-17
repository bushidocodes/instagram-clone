import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:1338",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm preview -- --host 0.0.0.0",
    url: "http://127.0.0.1:1338",
    reuseExistingServer: true,
  },
});
