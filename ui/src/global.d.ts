interface Window {
  // FLAG values are assigned by server under the window object.
  // parseFlagsUnderWindow parses them into the typed runtime values below.
  FLAG_ROOT_PATH: string;
  FLAG_PROMETHEUS_CONFIGURED: string;
  FLAG_READ_ONLY: string;

  // Root URL path for Asynqmon, without a trailing slash.
  ROOT_PATH: string;

  // Whether the server has a valid Prometheus base URL for chart queries.
  // The address itself stays server-side and is never exposed to the browser.
  PROMETHEUS_CONFIGURED: boolean;

  // If true, the app hides controls that make non-GET API requests.
  READ_ONLY: boolean;
}
