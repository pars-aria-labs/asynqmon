import {
  parseUnixTimeSeconds,
  positiveInteger,
  useURLFilters,
} from "../hooks/useURLFilters";
import CopyButton from "../components/common/CopyButton";
import PageHeader from "../components/common/PageHeader";
import React from "react";
import { connect, ConnectedProps } from "react-redux";
import { makeStyles } from "tss-react/mui";

import Container from "@mui/material/Container";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import WarningIcon from "@mui/icons-material/Warning";
import InfoIcon from "@mui/icons-material/Info";
import TimelineRounded from "@mui/icons-material/TimelineRounded";
import prettyBytes from "pretty-bytes";
import { getMetricsAsync } from "../actions/metricsActions";
import { listQueuesAsync } from "../actions/queuesActions";
import { AppState } from "../store";
import QueueMetricsChart from "../components/QueueMetricsChart";
import Tooltip from "../components/Tooltip";
import { currentUnixtime } from "../utils";
import MetricsFetchControls from "../components/MetricsFetchControls";
import { PrometheusMetricsResponse } from "../api";
import { usePolling } from "../hooks";
import {
  DEFAULT_METRICS_DURATION_SECONDS,
  MAX_METRICS_DURATION_SECONDS,
} from "../metricsLimits";

const useStyles = makeStyles()((theme) => ({
  container: {
    marginTop: 30,
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(4),
  },
  controlsContainer: {
    display: "flex",
    justifyContent: "flex-end",
    position: "fixed",
    background: theme.palette.background.paper,
    zIndex: theme.zIndex.appBar,
    right: 0,
    top: 64, // app-bar height
    width: "100%",
    padding: theme.spacing(2),
  },
  chartInfo: {
    display: "flex",
    alignItems: "center",
    marginBottom: theme.spacing(1),
  },
  infoIcon: {
    marginLeft: theme.spacing(1),
    color: theme.palette.grey[500],
    cursor: "pointer",
  },
  errorMessage: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
  },
  warningIcon: {
    color: "#ff6700",
    marginRight: 6,
  },
}));

function mapStateToProps(state: AppState) {
  return {
    loading: state.metrics.loading,
    error: state.metrics.error,
    data: state.metrics.data,
    pollInterval: state.settings.pollInterval,
    queues: state.queues.data.map((q) => q.name),
  };
}

const connector = connect(mapStateToProps, {
  getMetricsAsync,
  listQueuesAsync,
});
type Props = ConnectedProps<typeof connector>;

const ENDTIME_URL_PARAM_KEY = "end";
const DURATION_URL_PARAM_KEY = "duration";

function MetricsView(props: Props) {
  if (!window.PROMETHEUS_CONFIGURED) {
    return <PrometheusSetupView />;
  }
  return <ConfiguredMetricsView {...props} />;
}

function ConfiguredMetricsView(props: Props) {
  const { classes } = useStyles();
  const { filters: query, setFilters } = useURLFilters();

  const endTimeStr = query.get(ENDTIME_URL_PARAM_KEY);
  const fixedEndTime = parseUnixTimeSeconds(endTimeStr);
  const isEndTimeFixed = fixedEndTime !== null;

  const durationStr = query.get(DURATION_URL_PARAM_KEY);
  const requestedDurationSec = positiveInteger(
    durationStr,
    DEFAULT_METRICS_DURATION_SECONDS,
  );
  const durationSec = Math.min(
    requestedDurationSec,
    MAX_METRICS_DURATION_SECONDS,
  );

  const { pollInterval, getMetricsAsync, listQueuesAsync, data } = props;

  const [realtimeEndTime, setRealtimeEndTime] = React.useState(currentUnixtime);
  const endTimeSec = fixedEndTime ?? realtimeEndTime;
  const selectedQueues = React.useMemo(() => (query.get("queues") || "").split(",").filter(Boolean), [query]);
  const setSelectedQueues = (queues: string[]) => setFilters({ queues: queues.join(",") });

  React.useEffect(() => {
    if (durationStr !== null && durationStr !== String(durationSec)) {
      setFilters({ duration: String(durationSec) }, true);
    }
  }, [durationSec, durationStr, setFilters]);

  const handleEndTimeChange = React.useCallback(
    (end: number, fixed: boolean) => {
      setFilters(
        { end: fixed ? String(end) : null, duration: String(durationSec) },
        !fixed,
      );
      if (!fixed) setRealtimeEndTime(end);
    },
    [durationSec, setFilters],
  );
  const handleDurationChange = React.useCallback(
    (nextDuration: number, fixed: boolean) => {
      setFilters({
        end: fixed ? String(endTimeSec) : null,
        duration: String(nextDuration),
      });
    },
    [endTimeSec, setFilters],
  );

  const handleAddQueue = (qname: string) => {
    if (selectedQueues.includes(qname)) {
      return;
    }
    setSelectedQueues(selectedQueues.concat(qname));
  };

  const handleRemoveQueue = (qname: string) => {
    if (selectedQueues.length === 1) {
      return; // ensure that selected queues doesn't go down to zero once user selected
    }
    if (selectedQueues.length === 0) {
      // when user first select filter (remove once of the queues),
      // we need to lazily initialize the selectedQueues with the rest (all queues but the selected one).
      setSelectedQueues(props.queues.filter((q) => q !== qname));
      return;
    }
    setSelectedQueues(selectedQueues.filter((q) => q !== qname));
  };

  React.useEffect(() => {
    const controller = new AbortController();
    void listQueuesAsync(controller.signal);
    return () => controller.abort();
  }, [listQueuesAsync]);

  const fetchMetrics = React.useCallback((signal: AbortSignal) => {
    const requestedEndTime = fixedEndTime ?? currentUnixtime();
    if (fixedEndTime === null) setRealtimeEndTime(requestedEndTime);
    return getMetricsAsync(requestedEndTime, durationSec, selectedQueues, signal);
  }, [durationSec, fixedEndTime, getMetricsAsync, selectedQueues]);
  usePolling(fetchMetrics, pollInterval, !isEndTimeFixed);

  return (
    <Container maxWidth="lg" className={classes.container}>
      <PageHeader
        title="Metrics"
        description="Explore queue performance over time."
        actions={<CopyButton link label="Copy link" />}
      />
      <div className={classes.controlsContainer}>
        <MetricsFetchControls
          endTimeSec={endTimeSec}
          isEndTimeFixed={isEndTimeFixed}
          onEndTimeChange={handleEndTimeChange}
          durationSec={durationSec}
          onDurationChange={handleDurationChange}
          queues={props.queues}
          selectedQueues={
            // If none are selected (e.g. initial state), no filters should apply.
            selectedQueues.length === 0 ? props.queues : selectedQueues
          }
          addQueue={handleAddQueue}
          removeQueue={handleRemoveQueue}
        />
      </div>
      <Grid container spacing={3}>
        {data?.tasks_processed_per_second && (
          <Grid size={{ xs: 12 }}>
            <ChartRow
              title="Tasks Processed"
              description="Number of tasks processed (both succeeded and failed) per second."
              metrics={data.tasks_processed_per_second}
              endTime={endTimeSec}
              startTime={endTimeSec - durationSec}
            />
          </Grid>
        )}
        {data?.tasks_failed_per_second && (
          <Grid size={{ xs: 12 }}>
            <ChartRow
              title="Tasks Failed"
              description="Number of tasks failed per second."
              metrics={data.tasks_failed_per_second}
              endTime={endTimeSec}
              startTime={endTimeSec - durationSec}
            />
          </Grid>
        )}
        {data?.error_rate && (
          <Grid size={{ xs: 12 }}>
            <ChartRow
              title="Error Rate"
              description="Rate of task failures"
              metrics={data.error_rate}
              endTime={endTimeSec}
              startTime={endTimeSec - durationSec}
            />
          </Grid>
        )}
        {data?.queue_size && (
          <Grid size={{ xs: 12 }}>
            <ChartRow
              title="Queue Size"
              description="Total number of tasks in a given queue."
              metrics={data.queue_size}
              endTime={endTimeSec}
              startTime={endTimeSec - durationSec}
            />
          </Grid>
        )}
        {data?.queue_latency_seconds && (
          <Grid size={{ xs: 12 }}>
            <ChartRow
              title="Queue Latency"
              description="Latency of queue, measured by the oldest pending task in the queue."
              metrics={data.queue_latency_seconds}
              endTime={endTimeSec}
              startTime={endTimeSec - durationSec}
              yAxisTickFormatter={(val: number) => val + "s"}
            />
          </Grid>
        )}
        {data?.queue_size && (
          <Grid size={{ xs: 12 }}>
            <ChartRow
              title="Queue Memory Usage (approx)"
              description="Memory usage by queue. Approximate value by sampling a few tasks in a queue."
              metrics={data.queue_memory_usage_approx_bytes}
              endTime={endTimeSec}
              startTime={endTimeSec - durationSec}
              yAxisTickFormatter={(val: number) => {
                try {
                  return prettyBytes(val);
                } catch (error) {
                  return val + "B";
                }
              }}
            />
          </Grid>
        )}
        {data?.pending_tasks_by_queue && (
          <Grid size={{ xs: 12 }}>
            <ChartRow
              title="Pending Tasks"
              description="Number of pending tasks in a given queue."
              metrics={data.pending_tasks_by_queue}
              endTime={endTimeSec}
              startTime={endTimeSec - durationSec}
            />
          </Grid>
        )}
        {data?.retry_tasks_by_queue && (
          <Grid size={{ xs: 12 }}>
            <ChartRow
              title="Retry Tasks"
              description="Number of retry tasks in a given queue."
              metrics={data.retry_tasks_by_queue}
              endTime={endTimeSec}
              startTime={endTimeSec - durationSec}
            />
          </Grid>
        )}
        {data?.archived_tasks_by_queue && (
          <Grid size={{ xs: 12 }}>
            <ChartRow
              title="Archived Tasks"
              description="Number of archived tasks in a given queue."
              metrics={data.archived_tasks_by_queue}
              endTime={endTimeSec}
              startTime={endTimeSec - durationSec}
            />
          </Grid>
        )}
      </Grid>
    </Container>
  );
}

export default connector(MetricsView);

/******** Helper components ********/

function SetupCode({ children }: { children: string }) {
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        mt: 1.5,
        p: 2,
        borderRadius: 2,
        bgcolor: "grey.900",
        color: "grey.100",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        lineHeight: 1.65,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        overflowX: "auto",
      }}
    >
      <code>{children}</code>
    </Box>
  );
}

function PrometheusSetupView() {
  const { classes } = useStyles();
  return (
    <Container maxWidth="lg" className={classes.container}>
      <PageHeader
        title="Metrics"
        description="Explore queue performance over time."
        actions={<CopyButton link label="Copy link" />}
      />
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Box
              sx={{
                display: "grid",
                placeItems: "center",
                width: 52,
                height: 52,
                flex: "0 0 auto",
                borderRadius: 3,
                bgcolor: "primary.main",
                color: "primary.contrastText",
              }}
            >
              <TimelineRounded />
            </Box>
            <Box>
              <Typography component="h2" variant="h5" gutterBottom>
                Connect Prometheus to unlock time-series metrics
              </Typography>
              <Typography color="text.secondary">
                The dashboard is ready, but this Asynqmon server was started
                without a Prometheus address. No metrics requests are sent
                until the server is configured and restarted.
              </Typography>
            </Box>
          </Stack>

          <Alert severity="info">
            Configure an address reachable from the <strong>Asynqmon server</strong>,
            not from the browser. Asynqmon queries Prometheus on the server side.
          </Alert>

          <Box>
            <Typography component="h3" variant="h6" gutterBottom>
              1. Start the CLI with metrics enabled
            </Typography>
            <Typography color="text.secondary" variant="body2">
              This exposes queue metrics at <code>/metrics</code> and tells the
              dashboard where it can query Prometheus.
            </Typography>
            <SetupCode>{`./asynqmon \\
  --redis-addr=localhost:6379 \\
  --enable-metrics-exporter \\
  --prometheus-addr=http://localhost:9090`}</SetupCode>
          </Box>

          <Divider />

          <Box>
            <Typography component="h3" variant="h6" gutterBottom>
              2. Let Prometheus scrape Asynqmon
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Add a scrape target that resolves from the Prometheus process.
              In containers, use the service name instead of <code>localhost</code>.
            </Typography>
            <SetupCode>{`scrape_configs:
  - job_name: asynqmon
    static_configs:
      - targets: ["asynqmon:8080"]`}</SetupCode>
          </Box>

          <Divider />

          <Box>
            <Typography component="h3" variant="h6" gutterBottom>
              3. Embedding Asynqmon in a Go service
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Set <code>PrometheusAddress</code> when constructing the handler.
              Queries run on the Asynqmon server. Do not put credentials in
              this URL; use a network-restricted Prometheus endpoint instead.
            </Typography>
            <SetupCode>{`import (
  "github.com/pars-aria-labs/asynq"
  asynqmon "github.com/pars-aria-labs/asynqmon"
)

monitor := asynqmon.New(asynqmon.Options{
  RedisConnOpt:      asynq.RedisClientOpt{Addr: "localhost:6379"},
  PrometheusAddress: "http://localhost:9090",
})
defer monitor.Close()`}</SetupCode>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}

interface ChartRowProps {
  title: string;
  description: string;
  metrics: PrometheusMetricsResponse;
  endTime: number;
  startTime: number;
  yAxisTickFormatter?: (val: number) => string;
}

function ChartRow(props: ChartRowProps) {
  const { classes } = useStyles();
  return (
    <>
      <div className={classes.chartInfo}>
        <Typography color="textPrimary">{props.title}</Typography>
        <Tooltip title={<div>{props.description}</div>}>
          <InfoIcon fontSize="small" className={classes.infoIcon} />
        </Tooltip>
        {props.metrics.status === "error" && (
          <div className={classes.errorMessage}>
            <WarningIcon fontSize="small" className={classes.warningIcon} />
            <Typography color="textSecondary">
              Failed to get metrics data: {props.metrics.error}
            </Typography>
          </div>
        )}
      </div>
      <QueueMetricsChart
        data={
          props.metrics.status === "error"
            ? []
            : props.metrics.data?.result || []
        }
        endTime={props.endTime}
        startTime={props.startTime}
        yAxisTickFormatter={props.yAxisTickFormatter}
      />
    </>
  );
}
