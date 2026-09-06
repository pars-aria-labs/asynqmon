import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { vi } from "vitest";
import axios from "axios";
import App from "./App";
import { rootReducer } from "./store";
import { ThemePreference } from "./reducers/settingsReducer";
import { Queue } from "./api";

vi.mock("axios", async (importOriginal) => ({
  ...(await importOriginal<typeof import("axios")>()),
  default: vi.fn(),
}));
// Charts need real layout. They are exercised by the browser suite.
vi.mock("./components/QueueSizeChart", () => ({
  default: () => <div>Queue chart</div>,
}));
vi.mock("./components/DailyStatsChart", () => ({
  default: () => <div>Daily chart</div>,
}));
vi.mock("./components/ProcessedTasksChart", () => ({
  default: () => <div>Processed chart</div>,
}));

const queue = (name: string, paused = false): Queue => ({
  queue: name,
  paused,
  size: 12,
  groups: 0,
  latency_msec: 10,
  display_latency: "10ms",
  memory_usage_bytes: 1024,
  active: 2,
  pending: 10,
  aggregating: 0,
  scheduled: 0,
  retry: 0,
  archived: 0,
  completed: 0,
  processed: 50,
  failed: 3,
  timestamp: "2026-09-06T00:00:00Z",
});
function mount(path = "/") {
  window.history.replaceState({}, "", path);
  const store = configureStore({ reducer: rootReducer });
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
  return store;
}
beforeEach(() => {
  vi.clearAllMocks();
  window.ROOT_PATH = "";
  window.READ_ONLY = false;
  window.PROMETHEUS_CONFIGURED = false;
  vi.mocked(axios).mockImplementation(async (config) => ({
    data: String(
      typeof config === "string" ? config : (config as { url?: string }).url,
    ).includes("stats")
      ? { stats: {} }
      : { queues: [queue("default"), queue("emails", true)] },
  }));
});

test("filters queues by name and state, and clears an empty search", async () => {
  mount();
  const user = userEvent.setup();
  const table = await screen.findByRole("table", {
    name: "queues overview table",
  });
  expect(within(table).getByRole("link", { name: "emails" })).toBeVisible();
  await user.type(
    screen.getByRole("textbox", { name: "Search queues" }),
    "unknown",
  );
  expect(screen.getByText("No matching queues")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Queue status" }),
    "paused",
  );
  const filteredTable = screen.getByRole("table", {
    name: "queues overview table",
  });
  expect(
    within(filteredTable).getByRole("link", { name: "emails" }),
  ).toBeVisible();
  expect(
    within(filteredTable).queryByRole("link", { name: "default" }),
  ).toBeNull();
});

test("hides queue mutations in read-only mode", async () => {
  window.READ_ONLY = true;
  mount();
  const table = await screen.findByRole("table", {
    name: "queues overview table",
  });
  expect(screen.getByText("Read only")).toBeVisible();
  expect(
    within(table).queryByRole("columnheader", { name: "Actions" }),
  ).toBeNull();
});

test("theme switching updates the saved preference", async () => {
  const store = mount("/settings");
  await userEvent.click(
    await screen.findByRole("button", { name: "Switch to dark theme" }),
  );
  expect(store.getState().settings.themePreference).toBe(
    ThemePreference.Always,
  );
  expect(
    screen.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
});

test("keeps navigation and API requests under the server root path", async () => {
  window.ROOT_PATH = "/monitoring";
  mount("/monitoring/");
  await screen.findByRole("table", { name: "queues overview table" });
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
    "href",
    "/monitoring/settings",
  );
  expect(axios).toHaveBeenCalledWith(expect.objectContaining({
    method: "get",
    url: "/monitoring/api/queues",
  }));
});

test("shows a useful server error instead of a successful empty state", async () => {
  vi.mocked(axios).mockRejectedValue(new Error("Connection unavailable"));
  mount();
  expect(await screen.findByText(/Could not refresh queue data/)).toBeVisible();
  expect(screen.queryByText("No queues yet")).toBeNull();
});

test("restores dashboard filters from a shared URL", async () => {
  mount("/?q=emails&state=paused&sort=size&direction=desc&range=today");
  const table = await screen.findByRole("table", { name: "queues overview table" });
  expect(screen.getByRole("textbox", { name: "Search queues" })).toHaveValue("emails");
  expect(screen.getByRole("combobox", { name: "Queue status" })).toHaveValue("paused");
  expect(within(table).queryByRole("link", { name: "default" })).toBeNull();
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Queue status" }), "all");
  expect(new URLSearchParams(window.location.search).get("q")).toBe("emails");
  expect(new URLSearchParams(window.location.search).get("sort")).toBe("size");
});

test("manual refresh aborts stale queue and queue-stat generations", async () => {
  type PendingRequest = {
    signal?: AbortSignal;
    resolve: (response: { data: unknown }) => void;
  };
  const queueRequests: PendingRequest[] = [];
  const statsRequests: PendingRequest[] = [];

  vi.mocked(axios).mockImplementation(
    (config) =>
      new Promise((resolve) => {
        const request = {
          signal: (config as { signal?: AbortSignal }).signal,
          resolve,
        };
        const url = String((config as { url?: string }).url);
        (url.endsWith("/queue_stats") ? statsRequests : queueRequests).push(
          request,
        );
      }),
  );

  // Start with a known queue name so resolving the replacement queue request
  // does not intentionally trigger another stats fetch via the qnames effect.
  const store = configureStore({ reducer: rootReducer });
  store.dispatch({
    type: "LIST_QUEUES_SUCCESS",
    payload: { queues: [queue("default")] },
  });
  window.history.replaceState({}, "", "/");
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );

  await waitFor(() => {
    expect(queueRequests).toHaveLength(1);
    expect(statsRequests).toHaveLength(1);
  });

  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

  await waitFor(() => {
    expect(queueRequests).toHaveLength(2);
    expect(statsRequests).toHaveLength(2);
  });
  expect(queueRequests[0].signal?.aborted).toBe(true);
  expect(statsRequests[0].signal?.aborted).toBe(true);
  expect(queueRequests[1].signal?.aborted).toBe(false);
  expect(statsRequests[1].signal?.aborted).toBe(false);

  const freshQueue = { ...queue("default"), size: 77, processed: 90 };
  const freshStats = {
    default: [
      {
        queue: "default",
        date: "2026-09-05T00:00:00Z",
        processed: 44,
        failed: 2,
      },
    ],
  };
  await act(async () => {
    queueRequests[1].resolve({ data: { queues: [freshQueue] } });
    statsRequests[1].resolve({ data: { stats: freshStats } });
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(store.getState().queues.data[0].currentStats.size).toBe(77);
    expect(store.getState().queueStats.data).toEqual(freshStats);
  });

  // Simulate an adapter which ignores AbortSignal and resolves anyway. The
  // aborted thunks must still discard both stale payloads.
  await act(async () => {
    queueRequests[0].resolve({
      data: { queues: [{ ...queue("default"), size: 1 }] },
    });
    statsRequests[0].resolve({
      data: {
        stats: {
          default: [
            {
              queue: "default",
              date: "2026-09-05T00:00:00Z",
              processed: 1,
              failed: 1,
            },
          ],
        },
      },
    });
    await Promise.resolve();
  });

  expect(store.getState().queues.data[0].currentStats.size).toBe(77);
  expect(store.getState().queueStats.data).toEqual(freshStats);
});

test("queue mutations supersede an older dashboard poll", async () => {
  type QueueRequest = {
    signal?: AbortSignal;
    resolve: (response: { data: unknown }) => void;
  };
  const queueRequests: QueueRequest[] = [];
  let resolvePause: ((response: { data: unknown }) => void) | undefined;
  vi.mocked(axios).mockImplementation(
    (config) => {
      const request = config as {
        method?: string;
        signal?: AbortSignal;
        url?: string;
      };
      if (request.url?.endsWith("/queue_stats")) {
        return Promise.resolve({ data: { stats: {} } });
      }
      if (request.method === "post") {
        return new Promise((resolve) => {
          resolvePause = resolve;
        });
      }
      return new Promise((resolve) => {
        queueRequests.push({ signal: request.signal, resolve });
      });
    },
  );

  const store = configureStore({ reducer: rootReducer });
  store.dispatch({
    type: "LIST_QUEUES_SUCCESS",
    payload: { queues: [queue("default")] },
  });
  window.history.replaceState({}, "", "/");
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
  await waitFor(() => expect(queueRequests).toHaveLength(1));

  await userEvent.click(screen.getByRole("button", { name: "Pause default" }));
  expect(queueRequests[0].signal?.aborted).toBe(true);
  await waitFor(() => expect(resolvePause).toBeDefined());
  await act(async () => {
    resolvePause!({ data: {} });
    await Promise.resolve();
  });
  await waitFor(() => expect(queueRequests).toHaveLength(2));

  await act(async () => {
    queueRequests[1].resolve({
      data: { queues: [{ ...queue("default"), paused: true }] },
    });
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(store.getState().queues.data[0].currentStats.paused).toBe(true),
  );

  // A transport may ignore cancellation. Its late pre-mutation response still
  // must not revert the newer server state.
  await act(async () => {
    queueRequests[0].resolve({ data: { queues: [queue("default")] } });
    await Promise.resolve();
  });
  expect(store.getState().queues.data[0].currentStats.paused).toBe(true);
});

const taskFixture = {
  id: "test-task", queue: "emails", type: "email:deliver", payload: '{"recipient":"alice@example.test","attempt":1}',
  state: "archived", start_time: "", max_retry: 3, retried: 3, last_failed_at: "2026-09-06T11:00:00Z", error_message: "Mail service unavailable",
  next_process_at: "", timeout_seconds: 30, deadline: "", group: "", completed_at: "", result: "", ttl_seconds: 0, is_orphaned: false,
};

test("inspects and reruns a failed task, then reports its pending state", async () => {
  let state = "archived";
  vi.mocked(axios).mockImplementation(async input => {
    const config = input as unknown as { url: string; method: string };
    if (config.method === "post") { state = "pending"; return { data: {} }; }
    return { data: config.url.includes("/tasks/") ? { ...taskFixture, state } : { queues: [queue("emails")] } };
  });
  mount("/queues/emails/tasks/test-task");
  expect(await screen.findByText("Mail service unavailable")).toBeVisible();
  await userEvent.type(screen.getByRole("textbox", { name: "Search payload" }), "not-present");
  expect(screen.getByText("No matches")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Run now" }));
  expect(await screen.findByText(/Task moved to Pending/)).toBeVisible();
  expect(axios).toHaveBeenCalledWith(expect.objectContaining({ method: "post", url: "/api/queues/emails/archived_tasks/test-task:run" }));
  expect(screen.queryByRole("button", { name: "Run now" })).toBeNull();
});

test("keeps task data and reports an unsuccessful rerun", async () => {
  vi.mocked(axios).mockImplementation(async input => {
    const config = input as unknown as { url: string; method: string };
    if (config.method === "post") throw new Error("Server rejected the request");
    return { data: config.url.includes("/tasks/") ? taskFixture : { queues: [queue("emails")] } };
  });
  mount("/queues/emails/tasks/test-task");
  await userEvent.click(await screen.findByRole("button", { name: "Run now" }));
  expect(await screen.findByText(/Could not run task: Server rejected/)).toBeVisible();
  expect(screen.getByText("Mail service unavailable")).toBeVisible();
});

test("read-only task details never offer a rerun", async () => {
  window.READ_ONLY = true;
  vi.mocked(axios).mockImplementation(async input => ({ data: String((input as unknown as {url: string}).url).includes("/tasks/") ? taskFixture : { queues: [queue("emails")] } }));
  mount("/queues/emails/tasks/test-task");
  await screen.findByText("Mail service unavailable");
  expect(screen.queryByRole("button", { name: "Run now" })).toBeNull();
});

test("keeps Metrics discoverable and teaches setup without making requests", async () => {
  mount("/q/metrics");

  expect(await screen.findByRole("heading", { name: "Metrics" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Metrics" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(
    screen.getByRole("heading", {
      name: "Connect Prometheus to unlock time-series metrics",
    }),
  ).toBeVisible();
  expect(screen.getByText(/--prometheus-addr=http:\/\/localhost:9090/)).toBeVisible();
  expect(screen.getByText(/github.com\/pars-aria-labs\/asynqmon/)).toBeVisible();
  expect(axios).not.toHaveBeenCalled();
});

test("treats an out-of-range metrics end time as realtime", async () => {
  window.PROMETHEUS_CONFIGURED = true;
  mount("/q/metrics?end=9007199254740991&duration=3600");

  expect(
    await screen.findByRole("button", { name: "Realtime: 1h" }),
  ).toBeVisible();
  await waitFor(() => {
    const metricsCall = vi.mocked(axios).mock.calls.find(([input]) =>
      String(
        typeof input === "string"
          ? input
          : (input as { url?: string }).url,
      ).includes("/api/metrics?"),
    );
    expect(metricsCall).toBeDefined();
    const input = metricsCall![0];
    const url =
      typeof input === "string"
        ? input
        : String((input as { url?: string }).url);
    const requested = new URL(url, "http://localhost").searchParams.get(
      "endtime",
    );
    expect(requested).not.toBe("9007199254740991");
    expect(Number.isFinite(new Date(Number(requested) * 1000).getTime())).toBe(
      true,
    );
  });
});

test("normalizes shared metrics URLs to the 30-day server limit", async () => {
  window.PROMETHEUS_CONFIGURED = true;
  mount("/q/metrics?duration=999999999");

  expect(
    await screen.findByRole("button", { name: "Realtime: 30d" }),
  ).toBeVisible();
  await waitFor(() => {
    expect(new URL(window.location.href).searchParams.get("duration")).toBe(
      "2592000",
    );
    const metricsCall = vi.mocked(axios).mock.calls.find(([input]) =>
      String(
        typeof input === "string"
          ? input
          : (input as { url?: string }).url,
      ).includes("/api/metrics?"),
    );
    expect(metricsCall).toBeDefined();
    const input = metricsCall![0];
    const url =
      typeof input === "string"
        ? input
        : String((input as { url?: string }).url);
    expect(new URL(url, "http://localhost").searchParams.get("duration")).toBe(
      "2592000",
    );
  });
});
