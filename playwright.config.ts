import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  use: {
    baseURL: process.env.QAYDA_TEST_URL ?? "http://127.0.0.1:3017",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.CI ? undefined : "chrome",
      },
    },
  ],
  webServer: process.env.QAYDA_TEST_URL
    ? undefined
    : {
        command: "npm run dev -w @qayda/web -- --port 3017",
        url: "http://127.0.0.1:3017",
        reuseExistingServer: !process.env.CI,
        env: process.env.QAYDA_CLOUD_E2E
          ? { QAYDA_DIST_DIR: ".next-test" }
          : {
              QAYDA_DIST_DIR: ".next-test",
              NEXT_PUBLIC_SUPABASE_URL: "",
              NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
            },
      },
  reporter: "list",
});
