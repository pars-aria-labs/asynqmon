import { act, renderHook } from "@testing-library/react";
import axios, { AxiosError } from "axios";
import { vi } from "vitest";
import request from "./request";
import {
 requestFinished,
 requestStarted,
 requestStatusForPath,
 requestStatusKey,
 useRequestStatus,
} from "./requestStatus";

vi.mock("axios", async original => ({ ...await original<typeof import("axios")>(), default: vi.fn() }));

test("retains last successful time after a read fails and clears the error on recovery", async () => {
 const { result } = renderHook(useRequestStatus);
 const url = "/api/status-recovery";
 vi.mocked(axios).mockResolvedValue({ data: {} });
 await act(async () => { await request({ url }); });
 const previousSuccess = result.current[url].lastSuccess;
 expect(previousSuccess).not.toBeNull();
 vi.mocked(axios).mockRejectedValue(new Error("network unavailable"));
 await act(async () => { await expect(request({ url })).rejects.toThrow(); });
 expect(result.current[url].lastSuccess).toBe(previousSuccess);
 expect(result.current[url].error).toBe("Could not reach the server");
 expect(result.current[url].pending).toBe(0);
 vi.mocked(axios).mockResolvedValue({ data: {} });
 await act(async () => { await request({ url }); });
 expect(result.current[url].error).toBe("");
});

test("does not treat a failed Prometheus query as fresh Redis data", async () => {
 const { result } = renderHook(useRequestStatus);
 vi.mocked(axios).mockResolvedValue({ data: { queue_size: { status: "error", error: "query timeout" } } });
 await act(async () => { await request({ url: "/api/metrics" }); });
 vi.mocked(axios).mockResolvedValue({ data: { queues: [] } });
 await act(async () => { await request({ url: "/api/queues" }); });
 expect(result.current["/api/metrics"].error).toBe("query timeout");
 expect(result.current["/api/metrics"].lastSuccess).toBeNull();
 expect(result.current["/api/queues"].error).toBe("");
});

test("retains metrics freshness across changing real-time end times", async () => {
 const { result } = renderHook(useRequestStatus);
 const path = "/test/api/metrics";
 const firstUrl = `${path}?duration=3600&endtime=100&queues=critical`;
 const nextUrl = `${path}?queues=critical&endtime=110&duration=3600`;
 const key = `${path}?duration=3600&queues=critical`;
 vi.mocked(axios).mockResolvedValueOnce({ data: {} });
 await act(async () => { await request({ url: firstUrl }); });
 const previousSuccess = result.current[key].lastSuccess;
 expect(previousSuccess).not.toBeNull();

 vi.mocked(axios).mockResolvedValueOnce({
   data: { queue_size: { status: "error", error: "query timeout" } },
 });
 await act(async () => { await request({ url: nextUrl }); });

 expect(requestStatusKey(firstUrl)).toBe(key);
 expect(requestStatusKey(nextUrl)).toBe(key);
 expect(result.current[key].lastSuccess).toBe(previousSuccess);
 expect(result.current[key].error).toBe("query timeout");
 expect(requestStatusForPath(result.current, path)?.key).toBe(key);
 expect(
   Object.values(result.current).filter(
     (status) => status.path === path,
   ),
 ).toHaveLength(1);
});

test("identifies expired authentication separately from a network failure", async () => {
 const { result } = renderHook(useRequestStatus);
 const error = new AxiosError("Unauthorized");
 error.response = { status: 401 } as any;
 vi.mocked(axios).mockRejectedValue(error);
 await act(async () => { await expect(request({ url: "/api/auth-test" })).rejects.toThrow(); });
 expect(result.current["/api/auth-test"].error).toBe("Authentication required");
});

test("closes cancelled request bookkeeping without reporting success or failure", async () => {
 const { result } = renderHook(useRequestStatus);
 const controller = new AbortController();
 const error = new AxiosError("cancelled", "ERR_CANCELED");
 controller.abort();
 vi.mocked(axios).mockRejectedValue(error);

 await act(async () => {
   await expect(request({ url: "/api/cancelled", signal: controller.signal })).rejects.toThrow();
 });

 expect(result.current["/api/cancelled"]).toMatchObject({
   pending: 0,
   lastSuccess: null,
   error: "",
 });
});

test("tracks materially different queries independently and aggregates the latest one", async () => {
 const { result } = renderHook(useRequestStatus);
 const path = "/api/queues/default/pending_tasks";
 const olderUrl = `${path}?size=20&page=1`;
 const latestUrl = `${path}?page=2&size=20`;
 let rejectOlder!: (reason: Error) => void;
 let resolveLatest!: (value: { data: object }) => void;
 vi.mocked(axios)
   .mockImplementationOnce(() => new Promise((_, reject) => { rejectOlder = reject; }))
   .mockImplementationOnce(() => new Promise((resolve) => { resolveLatest = resolve; }));

 let olderRequest!: Promise<unknown>;
 let latestRequest!: Promise<unknown>;
 act(() => {
   olderRequest = request({ url: olderUrl });
   latestRequest = request({ url: latestUrl });
 });
 await act(async () => {
   resolveLatest({ data: {} });
   await latestRequest;
 });
 await act(async () => {
   rejectOlder(new Error("old page failed late"));
   await expect(olderRequest).rejects.toThrow("old page failed late");
 });

 const olderKey = requestStatusKey(olderUrl);
 const latestKey = requestStatusKey(latestUrl);
 expect(olderKey).toBe(`${path}?page=1&size=20`);
 expect(result.current[olderKey].error).toBe("Could not reach the server");
 expect(result.current[latestKey].error).toBe("");
 expect(requestStatusForPath(result.current, path)?.key).toBe(latestKey);
});

test("bounds retained query variants for any one resource path", async () => {
 const { result } = renderHook(useRequestStatus);
 const path = "/api/bounded-metrics";
 vi.mocked(axios).mockResolvedValue({ data: {} });
 for (let endtime = 1; endtime <= 25; endtime++) {
   await act(async () => {
     await request({ url: `${path}?duration=60&endtime=${endtime}` });
   });
 }
 const variants = Object.values(result.current).filter(
   (status) => status.path === path,
 );
 expect(variants).toHaveLength(20);
 expect(requestStatusForPath(result.current, path)?.key).toBe(
   `${path}?duration=60&endtime=25`,
 );
});

test("bounds request paths globally without deleting pending requests", () => {
 const { result } = renderHook(useRequestStatus);
 let pending!: ReturnType<typeof requestStarted>;

 act(() => {
   pending = requestStarted("/api/global-cap/pending");
   for (let id = 1; id <= 205; id++) {
     const identity = requestStarted(`/api/global-cap/tasks/${id}`);
     requestFinished(identity);
   }
 });

 expect(Object.keys(result.current).length).toBeLessThanOrEqual(200);
 expect(result.current[pending.key].pending).toBe(1);
 expect(result.current["/api/global-cap/tasks/1"]).toBeUndefined();
 expect(result.current["/api/global-cap/tasks/205"]).toBeDefined();

 act(() => requestFinished(pending));
 expect(result.current[pending.key].pending).toBe(0);
});
