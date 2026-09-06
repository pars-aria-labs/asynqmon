import { isAxiosError } from "axios";

export function toErrorStringWithHttpStatus(error: unknown): string {
  if (!isAxiosError(error) || !error.response) return toErrorString(error);
  return `${error.response.status} (${error.response.statusText}): ${toErrorString(error)}`;
}

export function toErrorString(error: unknown): string {
  if (isAxiosError(error)) {
    if (typeof error.response?.data === "string") return error.response.data;
    return error.message || "Could not reach the server.";
  }
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}

interface Duration {
  hour: number;
  minute: number;
  second: number;
  totalSeconds: number;
}

// Returns a duration from the number of seconds provided.
export function durationFromSeconds(totalSeconds: number): Duration {
  const hour = Math.floor(totalSeconds / 3600);
  const minute = Math.floor((totalSeconds - 3600 * hour) / 60);
  const second = totalSeconds - 3600 * hour - 60 * minute;
  return { hour, minute, second, totalSeconds };
}

// start and end are in milliseconds.
function durationBetween(start: number, end: number): Duration {
  const durationInMillisec = start - end;
  const totalSeconds = Math.floor(durationInMillisec / 1000);
  return durationFromSeconds(totalSeconds);
}

export function stringifyDuration(d: Duration): string {
  if (d.hour > 24) {
    const n = Math.floor(d.hour / 24);
    return n + (n === 1 ? " day" : " days");
  }
  return (
    (d.hour !== 0 ? `${d.hour}h` : "") +
    (d.minute !== 0 ? `${d.minute}m` : "") +
    `${d.second}s`
  );
}

export function durationBefore(timestamp: string): string {
  try {
    const duration = durationBetween(Date.parse(timestamp), Date.now());
    if (duration.totalSeconds < 1) {
      return "now";
    }
    return "in " + stringifyDuration(duration);
  } catch {
    return "-";
  }
}

const zeroTimestamp = "0001-01-01T00:00:00Z";
export function timeAgo(timestamp: string): string {
  if (timestamp === zeroTimestamp) {
    return "-";
  }
  try {
    return timeAgoUnix(Date.parse(timestamp) / 1000);
  } catch (error) {
    console.error("Could not parse timestamp: ", timestamp, error);
    return "-";
  }
}

export function timeAgoUnix(unixtime: number): string {
  if (unixtime === 0) {
    return "";
  }
  const duration = durationBetween(Date.now(), unixtime * 1000);
  return stringifyDuration(duration) + " ago";
}

export function getCurrentUTCDate(): string {
  const today = new Date();
  const dd = today.getUTCDate().toString().padStart(2, "0");
  const mm = (today.getMonth() + 1).toString().padStart(2, "0");
  const yyyy = today.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

export function uuidPrefix(uuid: string): string {
  const idx = uuid.indexOf("-");
  if (idx === -1) {
    return uuid;
  }
  return uuid.substr(0, idx);
}

export function percentage(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.00%";
  const perc = ((numerator / denominator) * 100).toFixed(2);
  return `${perc} %`;
}

export function isJsonPayload(p: string) {
  try {
    JSON.parse(p);
  } catch (error) {
    return false;
  }
  return true;
}

export function prettifyPayload(p: string) {
  if (isJsonPayload(p)) {
    return JSON.stringify(JSON.parse(p), null, 2);
  }
  return p;
}

// Returns the number of seconds elapsed since January 1, 1970 00:00:00 UTC.
export function currentUnixtime(): number {
  return Math.floor(Date.now() / 1000);
}

const durationRegex = /^(\d+(?:\.\d+)?|\.\d+)([smhd])$/;
// Parses the given string and returns the number of seconds if the input is valid.
// Otherwise, it throws an error
// Supported time units are "s", "m", "h", and "d".
export function parseDuration(s: string): number {
  const match = durationRegex.exec(s.trim());
  if (match === null) {
    throw new Error("invalid duration");
  }
  const value = Number(match[1]);
  let seconds: number;
  switch (match[2]) {
    case "s":
      seconds = value;
      break;
    case "m":
      seconds = value * 60;
      break;
    case "h":
      seconds = value * 60 * 60;
      break;
    case "d":
      seconds = value * 24 * 60 * 60;
      break;
    default:
      throw new Error("invalid duration unit");
  }
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error(
      "duration must resolve to a positive whole number of seconds",
    );
  }
  return seconds;
}
