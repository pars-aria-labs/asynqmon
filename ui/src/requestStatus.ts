import { useSyncExternalStore } from "react";

export interface RequestStatus {
  key: string;
  path: string;
  pending: number;
  lastAttempt: number;
  lastSuccess: number | null;
  error: string;
  status?: number;
  order: number;
}

export interface RequestIdentity {
  key: string;
  order: number;
}

const maxVariantsPerPath = 20;
const maxTrackedRequests = 200;
let snapshot: Record<string, RequestStatus> = {};
let nextOrder = 0;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => snapshot;

export function requestStatusPath(key: string): string {
  const queryStart = key.indexOf("?");
  return queryStart === -1 ? key : key.slice(0, queryStart);
}

// Query values distinguish pagination, queue selections, and metric filters.
// Sorting names prevents equivalent URLs from creating two entries merely
// because their parameter order differs.
export function requestStatusKey(url: string): string {
  const withoutHash = url.split("#", 1)[0];
  const queryStart = withoutHash.indexOf("?");
  if (queryStart === -1) return withoutHash;

  const path = withoutHash.slice(0, queryStart);
  const query = new URLSearchParams(withoutHash.slice(queryStart + 1));
  // A real-time metrics poll advances only its observation endpoint. Keep it
  // attached to the same freshness record so a later failure can report the
  // last successful refresh. Duration and queue filters still identify
  // materially different chart data.
  if (path.endsWith("/api/metrics")) query.delete("endtime");
  query.sort();
  const canonicalQuery = query.toString();
  return canonicalQuery ? `${path}?${canonicalQuery}` : path;
}

function emptyStatus(key: string): RequestStatus {
  return {
    key,
    path: requestStatusPath(key),
    pending: 0,
    lastAttempt: 0,
    lastSuccess: null,
    error: "",
    order: 0,
  };
}

function prune(path: string) {
  let changed = false;
  const next = { ...snapshot };
  const variants = Object.values(snapshot)
    .filter((request) => request.path === path)
    .sort((left, right) => left.order - right.order);
  let removeCount = variants.length - maxVariantsPerPath;
  if (removeCount > 0) {
    for (const variant of variants) {
      if (removeCount === 0) break;
      // Never lose bookkeeping for a request that still has to finish.
      if (variant.pending > 0) continue;
      delete next[variant.key];
      changed = true;
      removeCount--;
    }
  }

  // Paths containing task IDs can themselves be unbounded, so the per-path
  // limit is not sufficient. Prefer retaining recent activity globally and
  // allow a temporary overflow rather than forgetting an in-flight request.
  let globalRemoveCount = Object.keys(next).length - maxTrackedRequests;
  if (globalRemoveCount > 0) {
    const completed = Object.values(next)
      .filter((request) => request.pending === 0)
      .sort((left, right) => left.order - right.order);
    for (const request of completed) {
      if (globalRemoveCount === 0) break;
      delete next[request.key];
      changed = true;
      globalRemoveCount--;
    }
  }

  if (changed) snapshot = next;
}

function update(key: string, value: Partial<RequestStatus>) {
  snapshot = {
    ...snapshot,
    [key]: { ...(snapshot[key] || emptyStatus(key)), ...value },
  };
  prune(requestStatusPath(key));
  listeners.forEach((listener) => listener());
}

export function requestStarted(url: string): RequestIdentity {
  const key = requestStatusKey(url);
  const order = ++nextOrder;
  update(key, {
    pending: (snapshot[key]?.pending || 0) + 1,
    lastAttempt: Date.now(),
    order,
  });
  return { key, order };
}

export function requestFinished(
  identity: RequestIdentity,
  error = "",
  status?: number,
) {
  const current = snapshot[identity.key] || emptyStatus(identity.key);
  const isLatestAttempt = current.order === identity.order;
  update(identity.key, {
    pending: Math.max(0, current.pending - 1),
    ...(isLatestAttempt
      ? {
          error,
          status,
          ...(!error ? { lastSuccess: Date.now() } : {}),
        }
      : {}),
  });
}

// Cancellation is neither a successful refresh nor a server failure. It only
// closes the in-flight bookkeeping entry so freshness indicators stay honest.
export function requestCancelled(identity: RequestIdentity) {
  const current = snapshot[identity.key] || emptyStatus(identity.key);
  update(identity.key, {
    pending: Math.max(0, current.pending - 1),
  });
}

// DataFreshness asks about a resource path, while individual requests retain
// their full query identity. The most recently started variant represents the
// current screen and cannot be overwritten by an older response finishing late.
export function requestStatusForPath(
  requests: Record<string, RequestStatus>,
  path: string,
): RequestStatus | undefined {
  return Object.values(requests)
    .filter((request) => request.path === path)
    .reduce<RequestStatus | undefined>(
      (latest, request) =>
        !latest || request.order > latest.order ? request : latest,
      undefined,
    );
}

export function useRequestStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
