import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { usePolling } from ".";

afterEach(() => {
  vi.useRealTimers();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function deferredValue<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("serializes effect generations and drops superseded polls", async () => {
  vi.useFakeTimers();
  const first = deferred();
  const intermediate = deferred();
  const latest = deferred();
  let active = 0;
  let maxActive = 0;
  const calls: string[] = [];
  const poll = (name: string, pending: ReturnType<typeof deferred>) =>
    vi.fn(async () => {
      calls.push(name);
      active++;
      maxActive = Math.max(maxActive, active);
      await pending.promise;
      active--;
    });
  const firstPoll = poll("first", first);
  const intermediatePoll = poll("intermediate", intermediate);
  const latestPoll = poll("latest", latest);

  const { rerender, unmount } = renderHook(
    ({ run }) => usePolling(run, 60),
    { initialProps: { run: firstPoll } },
  );
  await act(flushMicrotasks);
  expect(calls).toEqual(["first"]);

  rerender({ run: intermediatePoll });
  rerender({ run: latestPoll });
  await act(flushMicrotasks);
  expect(intermediatePoll).not.toHaveBeenCalled();
  expect(latestPoll).not.toHaveBeenCalled();

  await act(async () => {
    first.resolve();
    await first.promise;
    await flushMicrotasks();
  });
  expect(calls).toEqual(["first", "latest"]);
  expect(intermediatePoll).not.toHaveBeenCalled();
  expect(maxActive).toBe(1);

  unmount();
  await act(async () => {
    latest.resolve();
    await latest.promise;
    await flushMicrotasks();
  });
  expect(vi.getTimerCount()).toBe(0);
  expect(calls).toEqual(["first", "latest"]);
});

test("supports a one-shot poll without scheduling a timer", async () => {
  vi.useFakeTimers();
  const poll = vi.fn(async () => undefined);
  const { unmount } = renderHook(() => usePolling(poll, 1, false));

  await act(flushMicrotasks);
  expect(poll).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);

  await act(async () => {
    vi.advanceTimersByTime(10_000);
    await flushMicrotasks();
  });
  expect(poll).toHaveBeenCalledTimes(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test("aborts an in-flight poll so an unmounted generation cannot overwrite a remount", async () => {
  const oldResponse = deferredValue<string>();
  const newResponse = deferredValue<string>();
  let renderedValue = "initial";
  let oldSignal: AbortSignal | undefined;

  const oldPoll = vi.fn(async (signal: AbortSignal) => {
    oldSignal = signal;
    const value = await oldResponse.promise;
    // This is the same guard used by polling thunks before their final
    // reducer dispatch. It also protects tests/adapters that ignore abort.
    if (!signal.aborted) renderedValue = value;
  });
  const newPoll = vi.fn(async (signal: AbortSignal) => {
    const value = await newResponse.promise;
    if (!signal.aborted) renderedValue = value;
  });

  const firstMount = renderHook(() => usePolling(oldPoll, 60));
  await act(flushMicrotasks);
  expect(oldSignal?.aborted).toBe(false);

  firstMount.unmount();
  expect(oldSignal?.aborted).toBe(true);
  const secondMount = renderHook(() => usePolling(newPoll, 60));
  await act(flushMicrotasks);

  await act(async () => {
    newResponse.resolve("new response");
    await newResponse.promise;
    await flushMicrotasks();
  });
  expect(renderedValue).toBe("new response");

  await act(async () => {
    oldResponse.resolve("stale response");
    await oldResponse.promise;
    await flushMicrotasks();
  });
  expect(renderedValue).toBe("new response");
  secondMount.unmount();
});
