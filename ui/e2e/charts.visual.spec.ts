import { expect, test, type Page, type Route } from "@playwright/test";

const appURL = "http://127.0.0.1:3000";

const queues = [
  {
    queue: "critical",
    size: 96,
    groups: 2,
    active: 12,
    pending: 54,
    aggregating: 4,
    scheduled: 10,
    retry: 8,
    archived: 3,
    completed: 5,
    processed: 1480,
    failed: 24,
    paused: false,
    timestamp: "2026-09-06T12:00:00Z",
    latency_msec: 42,
    display_latency: "42ms",
    memory_usage_bytes: 1_572_864,
  },
  {
    queue: "emails",
    size: 64,
    groups: 0,
    active: 6,
    pending: 39,
    aggregating: 0,
    scheduled: 8,
    retry: 5,
    archived: 2,
    completed: 4,
    processed: 960,
    failed: 11,
    paused: false,
    timestamp: "2026-09-06T12:00:00Z",
    latency_msec: 18,
    display_latency: "18ms",
    memory_usage_bytes: 1_048_576,
  },
  {
    queue: "reports",
    size: 40,
    groups: 1,
    active: 0,
    pending: 20,
    aggregating: 5,
    scheduled: 7,
    retry: 4,
    archived: 3,
    completed: 1,
    processed: 510,
    failed: 7,
    paused: true,
    timestamp: "2026-09-06T12:00:00Z",
    latency_msec: 75,
    display_latency: "75ms",
    memory_usage_bytes: 786_432,
  },
];

async function fulfillDashboardData(route: Route) {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith("/queue_stats")) {
    await route.fulfill({ json: { stats: {} } });
    return;
  }
  await route.fulfill({ json: { queues } });
}

async function disableMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
}

test.use({
  colorScheme: "light",
  locale: "en-US",
  timezoneId: "UTC",
  viewport: { width: 1440, height: 1000 },
});

test("queue-size chart keeps its visual contract", async ({ page }) => {
  await page.route("**/api/queues", fulfillDashboardData);
  await page.route("**/api/queue_stats", fulfillDashboardData);

  await page.goto(appURL);
  await disableMotion(page);

  const chartCard = page
    .getByRole("heading", { name: "Queue Size" })
    .locator("xpath=ancestor::*[contains(@class, 'MuiPaper-root')][1]");
  await expect(
    chartCard.locator(".recharts-wrapper > .recharts-surface"),
  ).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await expect(chartCard).toHaveScreenshot("queue-size-chart.png", {
    animations: "disabled",
    caret: "hide",
    // Chromium glyph rasterization differs slightly between local ARM64 and
    // GitHub's AMD64 runner. Keep enough headroom for that known 2% variance
    // while still failing on meaningful layout or chart regressions.
    maxDiffPixelRatio: 0.025,
    scale: "css",
  });
});
