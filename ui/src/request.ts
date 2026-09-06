import axios, { AxiosRequestConfig, AxiosResponse, isAxiosError } from "axios";
import {
  requestCancelled,
  requestFinished,
  requestStarted,
} from "./requestStatus";

// Track reads individually: a successful Redis request must not hide a failed
// Prometheus request, nor claim that an older task response is fresh.
export default async function request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  const path = (config.url || "").split("?")[0];
  const track = (config.method || "get").toLowerCase() === "get";
  const identity = track ? requestStarted(config.url || "") : null;
  try {
    const response = await axios<T>({ timeout: 15000, ...config });
    if (identity) {
      const metricsError = path.endsWith("/api/metrics") && response.data && typeof response.data === "object"
        ? Object.values(response.data).find((value: any) => value?.status === "error") as { error?: string } | undefined
        : undefined;
      requestFinished(identity, metricsError ? metricsError.error || "Prometheus query failed" : "");
    }
    return response;
  } catch (error) {
    if (identity) {
      if (config.signal?.aborted || (isAxiosError(error) && error.code === "ERR_CANCELED")) {
        requestCancelled(identity);
        throw error;
      }
      const status = isAxiosError(error) ? error.response?.status : undefined;
      const message = status === 401 ? "Authentication required" : status === 403 ? "Access denied" : status ? `Server returned HTTP ${status}` : "Could not reach the server";
      requestFinished(identity, message, status);
    }
    throw error;
  }
}
