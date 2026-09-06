import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";

// Wait for each request to finish before scheduling the next one. This avoids
// overlapping requests and out-of-order responses on slow connections.
export function usePolling(
  doFn: (signal: AbortSignal) => Promise<unknown>,
  interval: number,
  repeat = true,
) {
  // The queue lives across effect generations. If dependencies change while a
  // request is in flight, the replacement generation waits for it instead of
  // starting an overlapping request.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const delay = repeat ? Math.max(1, interval) * 1000 : null;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let activeController: AbortController | undefined;
    const poll = () => {
      const run = queue.current
        .catch(() => undefined)
        .then(async () => {
          // A newer effect may have superseded this generation while it was
          // waiting in the queue.
          if (stopped) return false;
          const controller = new AbortController();
          activeController = controller;
          try {
            await doFn(controller.signal);
          } catch {
            // Callers report request failures in their own views.
          } finally {
            if (activeController === controller) activeController = undefined;
          }
          return true;
        });
      queue.current = run.then(() => undefined, () => undefined);
      void run.then((executed) => {
        if (executed && !stopped && delay !== null) {
          timer = setTimeout(poll, delay);
        }
      });
    };
    poll();
    return () => {
      stopped = true;
      activeController?.abort();
      clearTimeout(timer);
    };
  }, [delay, doFn]);
}

// useQuery gets the URL search params from the current URL.
export function useQuery(): URLSearchParams {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}
