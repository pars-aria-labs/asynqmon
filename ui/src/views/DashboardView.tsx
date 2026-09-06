import { useURLFilters } from "../hooks/useURLFilters";
import CopyButton from "../components/common/CopyButton";
import {
  Box,
  Button,
  Chip,
  InputAdornment,
  LinearProgress,
  Skeleton,
  Stack,
  TextField,
  useTheme,
} from "@mui/material";
import {
  RefreshRounded,
  SearchRounded,
  LayersOutlined,
  PlayArrowRounded,
  CheckCircleOutlineRounded,
  ErrorOutlineRounded,
} from "@mui/icons-material";
import PageHeader from "../components/common/PageHeader";
import StatCard from "../components/common/StatCard";
import React, { useEffect } from "react";
import { connect, ConnectedProps } from "react-redux";
import Container from "@mui/material/Container";
import { makeStyles } from "tss-react/mui";

import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import InfoIcon from "@mui/icons-material/Info";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import {
  listQueuesAsync,
  pauseQueueAsync,
  resumeQueueAsync,
  deleteQueueAsync,
} from "../actions/queuesActions";
import { listQueueStatsAsync } from "../actions/queueStatsActions";
import { dailyStatsKeyChange } from "../actions/settingsActions";
import { AppState } from "../store";
import QueueSizeChart from "../components/QueueSizeChart";
import ProcessedTasksChart from "../components/ProcessedTasksChart";
import QueuesOverviewTable from "../components/QueuesOverviewTable";
import Tooltip from "../components/Tooltip";
import SplitButton from "../components/SplitButton";
import { usePolling } from "../hooks";
import DailyStatsChart from "../components/DailyStatsChart";

const useStyles = makeStyles()((theme) => ({
  container: {
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(4),
  },
  paper: {
    padding: theme.spacing(2),
    display: "flex",
    overflow: "auto",
    flexDirection: "column",
  },
  chartHeader: {
    minHeight: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing(2),
  },
  chartHeaderTitle: {
    display: "flex",
    alignItems: "center",
  },
  chartContainer: {
    width: "100%",
    height: "300px",
    [theme.breakpoints.down("sm")]: { height: "320px" },
  },
  infoIcon: {
    marginLeft: theme.spacing(1),
    color: theme.palette.grey[500],
    cursor: "pointer",
  },
  tooltipSection: {
    marginBottom: "4px",
  },
  tableContainer: {
    marginBottom: theme.spacing(2),
  },
}));

function mapStateToProps(state: AppState) {
  return {
    loading: state.queues.loading,
    queues: state.queues.data.map((q) => ({
      ...q.currentStats,
      requestPending: q.requestPending,
    })),
    error: state.queues.error,
    pollInterval: state.settings.pollInterval,
    queueStats: state.queueStats.data,
    dailyStatsKey: state.settings.dailyStatsChartType,
  };
}

const mapDispatchToProps = {
  listQueuesAsync,
  pauseQueueAsync,
  resumeQueueAsync,
  deleteQueueAsync,
  listQueueStatsAsync,
  dailyStatsKeyChange,
};

const connector = connect(mapStateToProps, mapDispatchToProps);

type Props = ConnectedProps<typeof connector>;

import { DailyStatsKey } from "../types/preferences";

// Keep a single generation of a dashboard read active. Polling, a manual
// refresh, and a queue-name change can all request the same resource; starting
// the newer request aborts the signal observed by the older Redux thunk.
function useLatestAbortableRequest(
  request: (signal?: AbortSignal) => Promise<unknown>,
) {
  const activeRequest = React.useRef<AbortController | null>(null);

  const cancel = React.useCallback(() => {
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  React.useEffect(() => () => cancel(), [cancel]);

  const run = React.useCallback(
    (upstreamSignal?: AbortSignal) => {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      const abort = () => controller.abort();

      if (upstreamSignal?.aborted) {
        abort();
      } else {
        upstreamSignal?.addEventListener("abort", abort, { once: true });
      }

      let result: Promise<unknown>;
      try {
        result = Promise.resolve(request(controller.signal));
      } catch (error) {
        upstreamSignal?.removeEventListener("abort", abort);
        if (activeRequest.current === controller) activeRequest.current = null;
        return Promise.reject(error);
      }

      return result.finally(() => {
        upstreamSignal?.removeEventListener("abort", abort);
        if (activeRequest.current === controller) activeRequest.current = null;
      });
    },
    [request],
  );

  return { run, cancel };
}

function DashboardView(props: Props) {
  const {
    pollInterval,
    listQueuesAsync,
    queues,
    listQueueStatsAsync,
  } = props;
  const { classes } = useStyles();
  const theme = useTheme();
  const { filters, setFilters } = useURLFilters();
  const search = filters.get("q") || "";
  const queueState = ["running", "paused"].includes(filters.get("state") || "") ? filters.get("state")! : "all";
  const requestedRange = filters.get("range");
  const dailyStatsKey = ["today", "last-7d", "last-30d", "last-90d"].includes(requestedRange || "") ? requestedRange as DailyStatsKey : props.dailyStatsKey;
  const setSearch = (value: string) => setFilters({ q: value }, true);
  const setQueueState = (value: string) => setFilters({ state: value === "all" ? null : value });
  const visibleQueues = queues.filter(
    (q) =>
      q.queue.toLowerCase().includes(search.toLowerCase()) &&
      (queueState === "all" ||
        (queueState === "paused" ? q.paused : !q.paused)),
  );
  const initialLoading = props.loading && queues.length === 0;
  const unavailable =
    initialLoading || (props.error.length > 0 && queues.length === 0);
  const totals = queues.reduce(
    (sum, q) => ({
      size: sum.size + q.size,
      active: sum.active + q.active,
      processed: sum.processed + q.processed,
      failed: sum.failed + q.failed,
    }),
    { size: 0, active: 0, processed: 0, failed: 0 },
  );

  const { run: refreshQueues, cancel: cancelQueueRefresh } =
    useLatestAbortableRequest(listQueuesAsync);
  const { run: refreshQueueStats } =
    useLatestAbortableRequest(listQueueStatsAsync);

  const pauseQueue = React.useCallback(
    async (qname: string) => {
      cancelQueueRefresh();
      await props.pauseQueueAsync(qname);
      await refreshQueues();
    },
    [cancelQueueRefresh, props.pauseQueueAsync, refreshQueues],
  );
  const resumeQueue = React.useCallback(
    async (qname: string) => {
      cancelQueueRefresh();
      await props.resumeQueueAsync(qname);
      await refreshQueues();
    },
    [cancelQueueRefresh, props.resumeQueueAsync, refreshQueues],
  );
  const deleteQueue = React.useCallback(
    async (qname: string) => {
      cancelQueueRefresh();
      await props.deleteQueueAsync(qname);
      await refreshQueues();
    },
    [cancelQueueRefresh, props.deleteQueueAsync, refreshQueues],
  );

  usePolling(refreshQueues, pollInterval);

  // Refetch queue stats if a queue is added or deleted.
  const qnames = queues
    .map((q) => q.queue)
    .sort()
    .join(",");

  useEffect(() => {
    const controller = new AbortController();
    void refreshQueueStats(controller.signal);
    return () => controller.abort();
  }, [refreshQueueStats, qnames]);

  const processedStats = queues.map((q) => ({
    queue: q.queue,
    succeeded: q.processed - q.failed,
    failed: q.failed,
  }));

  return (
    <Container maxWidth="xl" className={classes.container}>
      <PageHeader
        title="Queue overview"
        description="A clear view of your background work. Monitor activity and keep tasks moving."
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <CopyButton link label="Copy link" />
            <Chip
              size="small"
              variant="outlined"
              color={props.error ? "error" : "default"}
              label={
                props.error ? "Update failed" : `Refresh every ${pollInterval}s`
              }
            />
            <Button
              variant="outlined"
              startIcon={<RefreshRounded />}
              onClick={() => {
                void refreshQueues();
                void refreshQueueStats();
              }}
            >
              Refresh
            </Button>
          </Stack>
        }
      />
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          {
            label: "Queued tasks",
            value: totals.size,
            detail: `Across ${queues.length} queues`,
            icon: <LayersOutlined fontSize="small" />,
            color: theme.palette.primary.main,
          },
          {
            label: "Active now",
            value: totals.active,
            detail: "Tasks currently being processed",
            icon: <PlayArrowRounded fontSize="small" />,
            color: theme.palette.secondary.main,
          },
          {
            label: "Succeeded today",
            value: totals.processed - totals.failed,
            detail: "Successful attempts · UTC",
            icon: <CheckCircleOutlineRounded fontSize="small" />,
            color: theme.palette.success.main,
          },
          {
            label: "Failed today",
            value: totals.failed,
            detail: "Failed attempts · UTC",
            icon: <ErrorOutlineRounded fontSize="small" />,
            color: theme.palette.error.main,
          },
        ].map((stat) => (
          <Grid key={stat.label} size={{ xs: 6, lg: 3 }}>
            <StatCard {...stat} loading={unavailable} />
          </Grid>
        ))}
      </Grid>
      <Grid container spacing={3}>
        {props.error.length > 0 && (
          <Grid size={{ xs: 12 }}>
            <Alert severity="error">
              <AlertTitle>Error</AlertTitle>
              Could not refresh queue data. Check the server connection and try
              Refresh again.{" "}
              {queues.length > 0 && "The last available data is shown below."}
            </Alert>
          </Grid>
        )}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper className={classes.paper} variant="outlined">
            <div className={classes.chartHeader}>
              <div className={classes.chartHeaderTitle}>
                <Typography variant="h6">Queue Size</Typography>
                <Tooltip
                  title={
                    <div>
                      <div className={classes.tooltipSection}>
                        Total number of tasks in the queue
                      </div>
                      <div className={classes.tooltipSection}>
                        <strong>Active</strong>: number of tasks currently being
                        processed
                      </div>
                      <div className={classes.tooltipSection}>
                        <strong>Pending</strong>: number of tasks ready to be
                        processed
                      </div>
                      <div className={classes.tooltipSection}>
                        <strong>Scheduled</strong>: number of tasks scheduled to
                        be processed in the future
                      </div>
                      <div className={classes.tooltipSection}>
                        <strong>Retry</strong>: number of tasks scheduled to be
                        retried in the future
                      </div>
                      <div>
                        <strong>Archived</strong>: number of tasks exhausted
                        their retries
                      </div>
                    </div>
                  }
                >
                  <InfoIcon fontSize="small" className={classes.infoIcon} />
                </Tooltip>
              </div>
            </div>
            <div className={classes.chartContainer}>
              {unavailable ? (
                <Skeleton variant="rounded" height="100%" />
              ) : queues.length === 0 ? (
                <Box
                  sx={{
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                    color: "text.secondary",
                  }}
                >
                  Queue activity will appear here.
                </Box>
              ) : (
                <QueueSizeChart data={queues} />
              )}
            </div>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper className={classes.paper} variant="outlined">
            <div className={classes.chartHeader}>
              <div className={classes.chartHeaderTitle}>
                <Typography variant="h6">Tasks Processed</Typography>
                <Tooltip
                  title={
                    <div>
                      <div className={classes.tooltipSection}>
                        Total number of tasks processed in a given day (UTC)
                      </div>
                      <div className={classes.tooltipSection}>
                        <strong>Succeeded</strong>: number of tasks successfully
                        processed
                      </div>
                      <div>
                        <strong>Failed</strong>: number of tasks failed to be
                        processed
                      </div>
                    </div>
                  }
                >
                  <InfoIcon fontSize="small" className={classes.infoIcon} />
                </Tooltip>
              </div>
              <div>
                <SplitButton
                  options={[
                    { label: "Today", key: "today" },
                    { label: "Last 7d", key: "last-7d" },
                    { label: "Last 30d", key: "last-30d" },
                    { label: "Last 90d", key: "last-90d" },
                  ]}
                  key={dailyStatsKey}
                  initialSelectedKey={dailyStatsKey}
                  onSelect={(key) =>
                    { props.dailyStatsKeyChange(key as DailyStatsKey); setFilters({ range: key }); }
                  }
                />
              </div>
            </div>
            <div className={classes.chartContainer}>
              {dailyStatsKey === "today" && (
                <ProcessedTasksChart data={processedStats} />
              )}
              {dailyStatsKey === "last-7d" && (
                <DailyStatsChart data={props.queueStats} numDays={7} />
              )}
              {dailyStatsKey === "last-30d" && (
                <DailyStatsChart data={props.queueStats} numDays={30} />
              )}
              {dailyStatsKey === "last-90d" && (
                <DailyStatsChart data={props.queueStats} numDays={90} />
              )}
            </div>
          </Paper>
        </Grid>

        <Grid className={classes.tableContainer} size={{ xs: 12 }}>
          <Paper className={classes.paper} variant="outlined">
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 2,
                mb: 2,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6">Queues</Typography>
                <Chip size="small" label={queues.length} />
              </Stack>
              <Stack
                direction="row"
                spacing={1}
                sx={{ flexWrap: "wrap", gap: 1 }}
              >
                <TextField
                  size="small"
                  placeholder="Search queues…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputProps={{ "aria-label": "Search queues" }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRounded fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  select
                  size="small"
                  value={queueState}
                  onChange={(e) => setQueueState(e.target.value)}
                  SelectProps={{ native: true }}
                  inputProps={{ "aria-label": "Queue status" }}
                >
                  <option value="all">All states</option>
                  <option value="running">Running</option>
                  <option value="paused">Paused</option>
                </TextField>
              </Stack>
            </Box>
            {props.loading && (
              <LinearProgress aria-label="Refreshing queues" sx={{ mb: 1 }} />
            )}
            {unavailable ? (
              <Skeleton variant="rounded" height={140} />
            ) : visibleQueues.length === 0 ? (
              <Box sx={{ textAlign: "center", py: 6 }}>
                <LayersOutlined
                  sx={{ fontSize: 36, color: "text.disabled", mb: 1 }}
                />
                <Typography variant="h6">
                  {queues.length === 0 ? "No queues yet" : "No matching queues"}
                </Typography>
                <Typography
                  color="text.secondary"
                  variant="body2"
                  sx={{ mt: 0.75 }}
                >
                  {queues.length === 0
                    ? "Queues will appear automatically when your application enqueues tasks."
                    : "Try another name or choose a different state."}
                </Typography>
                {queues.length > 0 && (
                  <Button
                    sx={{ mt: 2 }}
                    onClick={() => {
                      setFilters({ q: null, state: null });
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </Box>
            ) : (
              <QueuesOverviewTable
                queues={visibleQueues}
                onPauseClick={pauseQueue}
                onResumeClick={resumeQueue}
                onDeleteClick={deleteQueue}
              />
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}

export default connector(DashboardView);
