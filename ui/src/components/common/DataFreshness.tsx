import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { Alert, Box, Chip, Popover, Stack, Typography } from "@mui/material";
import { AppState } from "../../store";
import {
  requestStatusForPath,
  useRequestStatus,
} from "../../requestStatus";

export default function DataFreshness() {
  const requests = useRequestStatus();
  const { pathname, search } = useLocation();
  const interval = useSelector((state: AppState) => state.settings.pollInterval);
  const [now, setNow] = useState(Date.now());
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const relative = pathname.slice(window.ROOT_PATH.length);
  const api = `${window.ROOT_PATH}/api`;
  let paths: string[];
  if (relative.startsWith("/queues/")) {
    const query = new URLSearchParams(search);
    const requested = query.get("status") || "active";
    const status = ["active", "pending", "aggregating", "scheduled", "retry", "archived", "completed"].includes(requested) ? requested : "active";
    if (relative.includes("/tasks/")) paths = [`${api}${relative}`];
    else if (status === "aggregating") paths = [`${api}${relative}/groups`, ...(query.get("group") ? [`${api}${relative}/groups/${query.get("group")}/aggregating_tasks`] : [])];
    else paths = [`${api}${relative}/${status}_tasks`];
  } else if (relative === "/q/metrics") {
    // The Metrics route doubles as an onboarding page when Prometheus is not
    // configured, so there is no request whose freshness could be reported.
    if (!window.PROMETHEUS_CONFIGURED) return null;
    paths = [`${api}/metrics`];
  }
  else if (relative === "/servers") paths = [`${api}/servers`];
  else if (relative === "/schedulers") paths = [`${api}/scheduler_entries`];
  else if (relative === "/redis") paths = [`${api}/redis_info`];
  else if (relative === "/" || relative === "") paths = [`${api}/queues`, `${api}/queue_stats`];
  else return null;
  const statuses = paths
    .map((path) => requestStatusForPath(requests, path))
    .filter((status): status is NonNullable<typeof status> => Boolean(status));
  const failed = statuses.filter(status => status.error);
  const pending = statuses.some(status => status.pending > 0);
  // History is intentionally fetched less often. Its failure still matters,
  // but only the current page's live resource determines the freshness age.
  const live = statuses.filter(status => !status.path.endsWith("/queue_stats"));
  const last = live.length && live.every(status => status.lastSuccess) ? Math.min(...live.map(status => status.lastSuccess!)) : null;
  const age = last === null ? null : Math.max(0, Math.floor((now - last) / 1000));
  const stale = age !== null && age > Math.max(30, interval * 3);
  const label = failed.length ? failed.some(s => s.status === 401) ? "Sign in required" : "Update failed" : pending ? "Updating…" : age === null ? "Waiting for data" : stale ? "Data may be stale" : `Updated ${age}s ago`;
  return <>
    <Chip aria-label={`Data status: ${label}`} label={label} size="small" variant="outlined" color={failed.length ? "error" : stale ? "warning" : "default"} onClick={e => setAnchor(e.currentTarget)} sx={{ maxWidth: { xs: 135, sm: 200 } }} />
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
      <Box sx={{ p: 2.5, maxWidth: 380 }}><Typography variant="h6" sx={{ mb: 1 }}>Data freshness</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Successful requests confirm access to the monitoring API. Failures do not necessarily mean Redis itself is offline.</Typography>
        {statuses.length === 0 && <Typography variant="body2">Waiting for the first response.</Typography>}
        <Stack spacing={2}>{statuses.map(status => <Box key={status.path}>
          <Typography variant="body2" fontWeight={600}>{status.path.endsWith("/metrics") ? "Prometheus" : status.path.endsWith("/queue_stats") ? "Queue history" : "Redis data"}</Typography>
          <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>{status.path.slice(api.length)}</Typography>
          <Typography variant="body2" color="text.secondary">{status.lastSuccess ? `Last success: ${new Date(status.lastSuccess).toLocaleTimeString()}` : "No successful response yet"}</Typography>
          {status.error && <Alert severity="error" sx={{ mt: 1 }}>{status.error}. {status.lastSuccess ? "Previously fetched data may still be displayed." : "Data is unavailable."}</Alert>}
        </Box>)}</Stack>
      </Box>
    </Popover>
  </>;
}
