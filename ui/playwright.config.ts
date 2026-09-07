import { defineConfig } from "@playwright/test";

const appURL = "http://127.0.0.1:3000";
const protectedAppPort = 3101;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["list"]] : "list",
  expect: { timeout: 15_000 },
  use: {
    baseURL: appURL,
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm start -- --host 127.0.0.1",
      url: appURL,
      reuseExistingServer: !isCI,
    },
    {
      // Exercise the real Go security middleware without touching Redis data.
      // The security tests only request an embedded static file and an unknown
      // API mutation, so the deliberately unreachable Redis address is safe.
      command:
        `go run ../cmd/asynqmon --port=${protectedAppPort} ` +
        "--redis-addr=127.0.0.1:1 --read-only " +
        "--basic-auth-username=e2e-operator --basic-auth-password=e2e-secret",
      port: protectedAppPort,
      timeout: 120_000,
      reuseExistingServer: !isCI,
    },
  ],
});
