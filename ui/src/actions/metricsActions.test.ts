import { Dispatch } from "redux";
import { vi } from "vitest";
import { getMetrics, MetricsResponse } from "../api";
import metricsReducer from "../reducers/metricsReducer";
import {
  getMetricsAsync,
  MetricsActionTypes,
} from "./metricsActions";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  getMetrics: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function response(label: string) {
  return { label } as unknown as MetricsResponse;
}

test("an aborted response from an unmounted view cannot overwrite newer metrics", async () => {
  const stale = deferred<MetricsResponse>();
  const fresh = deferred<MetricsResponse>();
  vi.mocked(getMetrics)
    .mockReturnValueOnce(stale.promise)
    .mockReturnValueOnce(fresh.promise);

  let state = metricsReducer(undefined, { type: "test/init" } as never);
  const dispatch = ((action: MetricsActionTypes) => {
    state = metricsReducer(state, action);
    return action;
  }) as Dispatch<MetricsActionTypes>;

  const oldView = new AbortController();
  const oldRequest = getMetricsAsync(100, 60, [], oldView.signal)(dispatch);
  oldView.abort();

  const newView = new AbortController();
  const newRequest = getMetricsAsync(200, 60, [], newView.signal)(dispatch);
  const freshResponse = response("fresh");
  fresh.resolve(freshResponse);
  await newRequest;
  expect(state.data).toBe(freshResponse);

  stale.resolve(response("stale"));
  await oldRequest;
  expect(state.data).toBe(freshResponse);
  expect(state.loading).toBe(false);
});
