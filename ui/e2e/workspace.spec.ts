import { test, expect, type Page, type Route } from "@playwright/test";

const appURL = "http://127.0.0.1:3000";
const protectedAppURL = "http://127.0.0.1:3101";
const basicAuthorization =
  "Basic ZTJlLW9wZXJhdG9yOmUyZS1zZWNyZXQ=";

const queues = [
  {
    queue: "default",
    size: 1240,
    active: 24,
    pending: 1090,
    processed: 8420,
    failed: 12,
    paused: false,
  },
  {
    queue: "emails",
    size: 328,
    active: 8,
    pending: 280,
    processed: 6240,
    failed: 3,
    paused: false,
  },
  {
    queue: "reports",
    size: 86,
    active: 0,
    pending: 62,
    processed: 910,
    failed: 0,
    paused: true,
  },
].map((q) => ({
  groups: 0,
  latency_msec: 24,
  display_latency: "24ms",
  memory_usage_bytes: 1048576,
  aggregating: 0,
  scheduled: 20,
  retry: 4,
  archived: 2,
  completed: 0,
  timestamp: new Date().toISOString(),
  ...q,
}));

const retryTask = {
  id: "task-retry-1",
  queue: "default",
  type: "email:deliver",
  payload: JSON.stringify({
    recipient: "alice@example.com",
    metadata: { campaign: "spring" },
  }),
  state: "retry",
  start_time: "0001-01-01T00:00:00Z",
  max_retry: 5,
  retried: 2,
  last_failed_at: "2026-09-06T12:00:00Z",
  error_message: "SMTP connection timed out",
  next_process_at: "2026-09-06T12:05:00Z",
  timeout_seconds: 60,
  deadline: "2026-09-06T13:00:00Z",
  group: "",
  completed_at: "0001-01-01T00:00:00Z",
  result: JSON.stringify({ accepted: false, attempt: 2 }),
  ttl_seconds: 0,
  is_orphaned: false,
};

const prometheusMetricNames = [
  "queue_size",
  "queue_latency_seconds",
  "queue_memory_usage_approx_bytes",
  "tasks_processed_per_second",
  "tasks_failed_per_second",
  "error_rate",
  "pending_tasks_by_queue",
  "retry_tasks_by_queue",
  "archived_tasks_by_queue",
];

function metricsResponse(endTime: number) {
  return Object.fromEntries(
    prometheusMetricNames.map((name) => [
      name,
      {
        status: "success",
        data: {
          resultType: "matrix",
          result: [
            {
              metric: {
                __name__: `asynq_${name}`,
                instance: "demo",
                job: "asynqmon",
                queue: "emails",
              },
              values: [
                [endTime - 60, "2"],
                [endTime, "3"],
              ],
            },
          ],
        },
      },
    ]),
  );
}

async function setRuntimeFlags(
  page: Page,
  flags: { readOnly?: boolean; prometheus?: boolean },
) {
  await page.route(`${appURL}/**`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    let html = await response.text();
    if (flags.readOnly !== undefined) {
      html = html.replace(
        'window.FLAG_READ_ONLY = "false"',
        `window.FLAG_READ_ONLY = "${flags.readOnly}"`,
      );
    }
    if (flags.prometheus !== undefined) {
      html = html.replace(
        'window.FLAG_PROMETHEUS_CONFIGURED = ""',
        `window.FLAG_PROMETHEUS_CONFIGURED = "${flags.prometheus}"`,
      );
    }
    await route.fulfill({ response, body: html });
  });
}

async function fulfillLiveData(route: Route, online: boolean) {
  if (!online) {
    await route.abort("internetdisconnected");
    return;
  }
  const url = new URL(route.request().url());
  if (url.pathname.endsWith("queue_stats")) {
    await route.fulfill({ json: { stats: {} } });
    return;
  }
  await route.fulfill({ json: { queues } });
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    let body: unknown = { queues };
    if (url.pathname.endsWith("queue_stats"))
      body = {
        stats: Object.fromEntries(
          queues.map((q) => [
            q.queue,
            Array.from({ length: 7 }, (_, i) => ({
              queue: q.queue,
              date: new Date(Date.now() - (6 - i) * 86400000)
                .toISOString()
                .slice(0, 10),
              processed: 500 + i * 130,
              failed: 3 + i * 2,
            })),
          ]),
        ),
      };
    if (
      /\/(?:active|pending|scheduled|retry|archived|completed)_tasks/.test(
        url.pathname,
      )
    )
      body = { tasks: [], stats: queues[0] };
    if (url.pathname.endsWith("/servers")) body = { servers: [] };
    if (url.pathname.endsWith("/scheduler_entries")) body = { entries: [] };
    return route.fulfill({ json: body });
  });
});

test("desktop dashboard, filters, theme, and queue details", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Queue overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "emails", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".recharts-wrapper > .recharts-surface"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Pause emails", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/asynqmon-desktop.png", fullPage: true });
  await page.getByRole("textbox", { name: "Search queues" }).fill("reports");
  await expect(
    page.getByRole("link", { name: "emails", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search queues" }).fill("");
  await page
    .getByRole("combobox", { name: "Queue status" })
    .selectOption("paused");
  await expect(
    page.getByRole("link", { name: "reports", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(
    page.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Queue status" })
    .selectOption("all");
  await page.screenshot({ path: "/tmp/asynqmon-dark.png", fullPage: true });
  await page.getByRole("link", { name: "default", exact: true }).click();
  await expect(page).toHaveURL(/\/queues\/default/);
  await expect(page.getByRole("tab", { name: /Active/ })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "No active tasks at this time.",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("dashboard filters survive refresh and browser history", async ({
  page,
}) => {
  await page.goto("/?q=reports");
  await expect(page.getByRole("textbox", { name: "Search queues" })).toHaveValue(
    "reports",
  );
  await expect(
    page.getByRole("link", { name: "reports", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("combobox", { name: "Queue status" })
    .selectOption("paused");
  await expect(page).toHaveURL(/q=reports.*state=paused/);
  await page
    .getByRole("combobox", { name: "Queue status" })
    .selectOption("running");
  await expect(page).toHaveURL(/q=reports.*state=running/);
  await expect(page.getByText("No matching queues")).toBeVisible();

  await page.goBack();
  await expect(
    page.getByRole("combobox", { name: "Queue status" }),
  ).toHaveValue("paused");
  await expect(
    page.getByRole("link", { name: "reports", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("combobox", { name: "Queue status" }),
  ).toHaveValue("all");
  await expect(page.getByRole("textbox", { name: "Search queues" })).toHaveValue(
    "reports",
  );

  await page.goForward();
  await expect(
    page.getByRole("combobox", { name: "Queue status" }),
  ).toHaveValue("paused");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Queue status" }),
  ).toHaveValue("paused");
  await expect(
    page.getByRole("link", { name: "reports", exact: true }),
  ).toBeVisible();
});

test("mobile navigation and page fit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Queue overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "emails", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/asynqmon-mobile.png", fullPage: true });
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/settings/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("read-only hides mutation controls", async ({ page }) => {
  await setRuntimeFlags(page, { readOnly: true });
  await page.goto("/");
  await expect(page.getByText("Read only", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "emails", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: /^Pause |^Resume |^Delete / }),
  ).toHaveCount(0);
});

test("real server challenges Basic Auth and rejects unsafe mutations", async ({
  browser,
  request,
}) => {
  const unauthenticated = await request.get(`${protectedAppURL}/robots.txt`);
  expect(unauthenticated.status()).toBe(401);
  expect(unauthenticated.headers()["www-authenticate"]).toBe(
    'Basic realm="Asynqmon", charset="UTF-8"',
  );
  expect(unauthenticated.headers()["cache-control"]).toBe("private, no-store");

  const wrongPassword = await request.get(`${protectedAppURL}/robots.txt`, {
    headers: { authorization: "Basic ZTJlLW9wZXJhdG9yOndyb25n" },
  });
  expect(wrongPassword.status()).toBe(401);

  const context = await browser.newContext({
    httpCredentials: {
      username: "e2e-operator",
      password: "e2e-secret",
    },
  });
  const protectedPage = await context.newPage();
  const authenticated = await protectedPage.goto(
    `${protectedAppURL}/robots.txt`,
  );
  expect(authenticated?.status()).toBe(200);
  await expect(protectedPage.locator("body")).toContainText("User-agent");
  await context.close();

  const sameOriginMutation = await request.post(
    `${protectedAppURL}/api/not-a-real-mutation`,
    {
      headers: {
        authorization: basicAuthorization,
        origin: protectedAppURL,
      },
    },
  );
  expect(sameOriginMutation.status()).toBe(405);
  expect(await sameOriginMutation.text()).toContain("read-only mode");

  const crossOriginMutation = await request.post(
    `${protectedAppURL}/api/not-a-real-mutation`,
    {
      headers: {
        authorization: basicAuthorization,
        origin: "https://attacker.example",
      },
    },
  );
  expect(crossOriginMutation.status()).toBe(403);
});

test("authenticated Go embed serves a SPA deep link and lazy view", async ({
  browser,
}) => {
  const context = await browser.newContext({
    httpCredentials: {
      username: "e2e-operator",
      password: "e2e-secret",
    },
  });
  const protectedPage = await context.newPage();
  const pageErrors: string[] = [];
  let apiRequests = 0;
  protectedPage.on("pageerror", (error) => pageErrors.push(error.message));
  await protectedPage.route(`${protectedAppURL}/api/servers`, async (route) => {
    apiRequests++;
    await route.fulfill({ json: { servers: [] } });
  });
  const lazyViewResponse = protectedPage.waitForResponse(
    (response) =>
      /\/assets\/ServersView-[^/]+\.js$/.test(
        new URL(response.url()).pathname,
      ) && response.status() === 200,
  );

  const documentResponse = await protectedPage.goto(
    `${protectedAppURL}/servers`,
  );
  expect(documentResponse?.status()).toBe(200);
  expect(documentResponse?.headers()["content-type"]).toContain("text/html");
  expect(documentResponse?.headers()["cache-control"]).toBe(
    "private, no-store",
  );

  const lazyResponse = await lazyViewResponse;
  expect(new URL(lazyResponse.url()).origin).toBe(protectedAppURL);
  expect(lazyResponse.headers()["content-type"]).toMatch(/javascript/);
  await expect(
    protectedPage.getByRole("heading", { name: "Servers", level: 1 }),
  ).toBeVisible();
  await expect(
    protectedPage.getByText("No servers found at this time."),
  ).toBeVisible();
  await expect(
    protectedPage.getByRole("link", { name: "Servers" }),
  ).toHaveAttribute("aria-current", "page");
  expect(apiRequests).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
  await context.close();
});

test("task details support JSON search, clipboard copy, and rerun", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: appURL,
  });
  let state = retryTask.state;
  await page.route(
    "**/api/queues/default/tasks/task-retry-1",
    async (route) => {
      await route.fulfill({ json: { ...retryTask, state } });
    },
  );
  await page.route(
    "**/api/queues/default/retry_tasks/task-retry-1:run",
    async (route) => {
      expect(route.request().method()).toBe("POST");
      state = "pending";
      await route.fulfill({ status: 204, body: "" });
    },
  );

  await page.goto("/queues/default/tasks/task-retry-1");
  await expect(
    page.getByRole("heading", { name: "email:deliver" }),
  ).toBeVisible();
  await expect(page.getByText("SMTP connection timed out")).toBeVisible();

  const payloadSearch = page.getByRole("textbox", { name: "Search payload" });
  await payloadSearch.fill("alice@example.com");
  await expect(page.getByText(/1 matching lines of/)).toBeVisible();
  await expect(page.locator("pre").filter({ hasText: "alice@example.com" })).toBeVisible();
  await payloadSearch.fill("does-not-exist");
  await expect(page.getByText("No matches", { exact: true })).toBeVisible();
  await payloadSearch.fill("");

  await page.getByRole("button", { name: "Copy payload" }).click();
  await expect(page.getByText("Copied to clipboard", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(JSON.stringify(JSON.parse(retryTask.payload), null, 2));

  const rerunRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().endsWith(
        "/api/queues/default/retry_tasks/task-retry-1:run",
      ),
  );
  await page.getByRole("button", { name: "Run now" }).click();
  await rerunRequest;
  await expect(
    page.getByRole("alert").filter({ hasText: "Task moved to Pending" }),
  ).toBeVisible();
  await expect(page.getByText("pending", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run now" })).toHaveCount(0);
});

test("freshness reports stale, offline, and recovered data", async ({ page }) => {
  const startedAt = new Date("2026-09-06T12:00:00Z");
  const pollIntervalSeconds = 60;
  await page.clock.setFixedTime(startedAt);
  await page.addInitScript((pollInterval) => {
    localStorage.setItem(
      "asynqmon:state",
      JSON.stringify({ settings: { pollInterval } }),
    );
  }, pollIntervalSeconds);
  let online = true;
  await page.route("**/api/queues", (route) => fulfillLiveData(route, online));
  await page.route("**/api/queue_stats", (route) =>
    fulfillLiveData(route, online),
  );

  await page.goto("/");
  await expect(page.getByLabel(/Data status: Updated \d+s ago/)).toBeVisible();

  await page.clock.setFixedTime(
    new Date(startedAt.getTime() + (pollIntervalSeconds * 3 + 1) * 1_000),
  );
  const staleStatus = page.getByLabel("Data status: Data may be stale");
  await expect(staleStatus).toBeVisible();

  online = false;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByLabel("Data status: Update failed")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "emails", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Data status: Update failed").click();
  await expect(
    page
      .getByText("Previously fetched data may still be displayed.")
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  online = true;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByLabel(/Data status: Updated \d+s ago/)).toBeVisible();
});

test("Metrics stays discoverable and explains setup when Prometheus is disabled", async ({
  page,
}) => {
  const metricRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/metrics?")) metricRequests.push(request.url());
  });

  await page.goto("/q/metrics");
  await expect(
    page.getByRole("heading", { name: "Metrics", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Metrics" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("heading", {
      name: "Connect Prometheus to unlock time-series metrics",
    }),
  ).toBeVisible();
  await expect(page.getByText(/--prometheus-addr=http:\/\/localhost:9090/)).toBeVisible();
  await expect(page.getByText(/github.com\/pars-aria-labs\/asynqmon/)).toBeVisible();
  await expect(page.getByLabel(/Data status:/)).toHaveCount(0);
  expect(metricRequests).toEqual([]);
});

test("Metrics renders data and preserves queue filters on refresh", async ({
  page,
}) => {
  await setRuntimeFlags(page, { prometheus: true });
  const metricRequests: URL[] = [];
  await page.route("**/api/metrics?*", async (route) => {
    const url = new URL(route.request().url());
    metricRequests.push(url);
    await route.fulfill({ json: metricsResponse(Number(url.searchParams.get("endtime"))) });
  });

  await page.goto(
    "/q/metrics?end=1700000000&duration=21600&queues=emails",
  );
  await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Metrics" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("Tasks Processed", { exact: true })).toBeVisible();
  await expect(page.getByText("Queue Size", { exact: true })).toBeVisible();
  await expect
    .poll(() => metricRequests.at(-1)?.searchParams.get("duration"))
    .toBe("21600");
  expect(metricRequests.at(-1)?.searchParams.get("endtime")).toBe(
    "1700000000",
  );
  expect(metricRequests.at(-1)?.searchParams.get("queues")).toBe("emails");

  await page.getByRole("button", { name: "filter" }).click();
  await expect(page.getByRole("checkbox", { name: "emails" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "default" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "default" }).check();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("queues"))
    .toBe("emails,default");

  await page.reload();
  await page.getByRole("button", { name: "filter" }).click();
  await expect(page.getByRole("checkbox", { name: "emails" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "default" })).toBeChecked();
  await expect
    .poll(() => metricRequests.at(-1)?.searchParams.get("queues"))
    .toBe("emails,default");
});

test("Metrics time controls follow browser back and forward", async ({ page }) => {
  await setRuntimeFlags(page, { prometheus: true });
  await page.route("**/api/metrics?*", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ json: metricsResponse(Number(url.searchParams.get("endtime"))) });
  });

  await page.goto("/q/metrics?end=1700000000&duration=21600");
  const timeControl = page.getByRole("button", { name: /Historical:/ });
  await expect(timeControl).toHaveText(/Historical:\s*6h/);
  await timeControl.click();
  await page.getByRole("radio", { name: "1 day" }).check();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("duration"))
    .toBe("86400");
  await page.keyboard.press("Escape");
  await expect(timeControl).toHaveText(/Historical:\s*1d/);

  await page.goBack();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("duration"))
    .toBe("21600");
  await expect(timeControl).toHaveText(/Historical:\s*6h/);

  await page.goForward();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("duration"))
    .toBe("86400");
  await expect(timeControl).toHaveText(/Historical:\s*1d/);
});
