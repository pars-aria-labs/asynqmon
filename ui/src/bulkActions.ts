import axios from "axios";

export type BulkAction = "delete" | "run" | "archive";

export interface BulkProgress {
  id: number;
  action: BulkAction;
  processed: number;
  total?: number;
}

let sequence = 0;
const active = new Map<number, BulkProgress>();
const listeners = new Set<() => void>();
let snapshot: BulkProgress[] = [];

interface BatchErrorData {
  error?: unknown;
  processed?: unknown;
}

function notify() {
  snapshot = Array.from(active.values());
  listeners.forEach((listener) => listener());
}

export function subscribeBulkProgress(listener: () => void) {
  listeners.add(listener);
  listener();
  return () => {
    listeners.delete(listener);
  };
}

export function getBulkProgress() {
  return snapshot;
}

function getBatchErrorData(error: unknown): BatchErrorData | undefined {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  return typeof data === "object" && data !== null
    ? (data as BatchErrorData)
    : undefined;
}

function confirmedFromFailedBatch(error: unknown, limit: number): number {
  const data = getBatchErrorData(error);
  return typeof data?.error === "string" &&
    Number.isSafeInteger(data.processed) &&
    (data.processed as number) >= 0 &&
    (data.processed as number) <= limit
    ? (data.processed as number)
    : 0;
}

function bulkActionError(error: unknown, processed: number): Error {
  const candidate = error as {
    message?: string;
    response?: { data?: unknown; [key: string]: unknown };
  };
  const batchData = getBatchErrorData(error);
  const detail =
    typeof candidate?.response?.data === "string"
      ? candidate.response.data
      : typeof batchData?.error === "string"
      ? batchData.error
      : candidate?.message || String(error);
  const wrapped = new Error(
    `Operation stopped after ${processed} confirmed tasks. ${detail}`
  );

  // Existing action handlers expect Axios-shaped errors. Keep the HTTP status
  // and expose the progress-aware message as response data for those handlers.
  if (candidate?.response) {
    Object.assign(wrapped, error, {
      response: { ...candidate.response, data: wrapped.message },
    });
  }
  return wrapped;
}

export async function performBulkAction(
  action: BulkAction,
  url: string
): Promise<number> {
  const id = ++sequence;
  let processed = 0;
  let budget: number | undefined;
  let inFlightLimit = 0;
  active.set(id, { id, action, processed });
  notify();

  try {
    while (budget === undefined || processed < budget) {
      const limit = Math.min(
        500,
        budget === undefined ? 500 : budget - processed
      );
      inFlightLimit = limit;
      const response = await axios({
        method: action === "delete" ? "delete" : "post",
        url,
        params: { batch_size: limit },
      });
      inFlightLimit = 0;
      const field: Record<BulkAction, string> = {
        delete: "deleted",
        run: "scheduled",
        archive: "archived",
      };
      const data = response.data as Record<string, number>;
      const count = data[field[action]];
      const remaining = data.remaining;

      // An older server performs the complete operation in one request and
      // omits `remaining`, even when the client sends `batch_size`.
      if (
        !Number.isSafeInteger(count) ||
        count < 0 ||
        (remaining !== undefined &&
          (!Number.isSafeInteger(remaining) ||
            remaining < 0 ||
            count > limit))
      ) {
        throw new Error("Invalid bulk operation response");
      }

      processed += count;
      if (remaining === undefined) {
        return processed;
      }

      // Freeze the initial amount of work. A producer may keep adding tasks,
      // but one user action must not chase a growing queue indefinitely.
      if (budget === undefined) {
        budget = processed + remaining;
      }
      active.set(id, { id, action, processed, total: budget });
      notify();

      // A concurrent consumer can empty the source between requests.
      if (remaining === 0 || count === 0) {
        break;
      }
    }
    return processed;
  } catch (error) {
    // Mutations are never retried automatically: a lost response may arrive
    // after Redis has already committed a batch.
    processed += confirmedFromFailedBatch(error, inFlightLimit);
    throw bulkActionError(error, processed);
  } finally {
    active.delete(id);
    notify();
  }
}
