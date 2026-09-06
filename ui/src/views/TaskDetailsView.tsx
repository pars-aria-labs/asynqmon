import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import { Alert, Box, Button, Chip, Container, Grid, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { ArrowBackRounded, PlayArrowRounded, RefreshRounded } from "@mui/icons-material";
import { AppState } from "../store";
import { getTaskInfo, listQueues, runArchivedTask, runRetryTask, runScheduledTask, TaskInfo } from "../api";
import { queueDetailsPath, TaskDetailsRouteParams } from "../paths";
import { usePolling } from "../hooks";
import { toErrorString } from "../utils";
import QueueBreadcrumb from "../components/QueueBreadcrumb";
import PageHeader from "../components/common/PageHeader";
import CopyButton from "../components/common/CopyButton";
import JsonViewer from "../components/common/JsonViewer";

function timestamp(value?: string) {
  if (!value || value === "-" || value.startsWith("0001-")) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
const runActions: Record<string, (queue: string, id: string) => Promise<void>> = {
  archived: runArchivedTask, retry: runRetryTask, scheduled: runScheduledTask,
};

export default function TaskDetailsView() {
  const { qname, taskId } = useParams<TaskDetailsRouteParams>();
  const interval = useSelector((state: AppState) => state.settings.pollInterval);
  const [record, setRecord] = useState<TaskInfo | null>(null);
  const [queues, setQueues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState<{ success: boolean; text: string } | null>(null);
  const sequence = useRef(0);
  const actionSequence = useRef(0);
  const task = record?.id === taskId && record.queue === qname ? record : null;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    listQueues(controller.signal).then(data => { if (active) setQueues(data.queues.map(queue => queue.queue)); }).catch(() => {});
    setOperation(null); setBusy(false); setRecord(null); setError("");
    return () => { active = false; controller.abort(); sequence.current++; actionSequence.current++; };
  }, [qname, taskId]);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const request = ++sequence.current;
    setLoading(true);
    try { const data = await getTaskInfo(qname, taskId, signal); if (!signal?.aborted && request === sequence.current) { setRecord(data); setError(""); } }
    catch (error) { if (!signal?.aborted && request === sequence.current) setError(toErrorString(error)); }
    finally { if (!signal?.aborted && request === sequence.current) setLoading(false); }
  }, [qname, taskId]);
  usePolling(refresh, interval);
  const runNow = async () => {
    if (!task || !runActions[task.state] || busy || window.READ_ONLY) return;
    const request = ++actionSequence.current;
    setBusy(true); setOperation(null);
    try {
      await runActions[task.state](qname, taskId);
      if (request !== actionSequence.current) return;
      setOperation({ success: true, text: "Task moved to Pending. A worker will process it when available." });
      await refresh();
    } catch (error) { if (request === actionSequence.current) setOperation({ success: false, text: `Could not run task: ${toErrorString(error)}` }); }
    finally { if (request === actionSequence.current) setBusy(false); }
  };
  return <Container maxWidth="xl" sx={{ py: 3 }}>
    <Box sx={{ mb: 3, overflowWrap: "anywhere" }}><QueueBreadcrumb queues={queues} queueName={qname} taskId={taskId} /></Box>
    <PageHeader title={task?.type || "Task details"} description={taskId} actions={<Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
      <CopyButton link label="Copy link" />
      <Button variant="outlined" startIcon={<RefreshRounded />} disabled={loading || busy} onClick={() => void refresh()}>Refresh</Button>
      {!window.READ_ONLY && task && runActions[task.state] && <Button variant="contained" startIcon={<PlayArrowRounded />} disabled={busy || loading || Boolean(error)} onClick={runNow}>{busy ? "Moving task…" : "Run now"}</Button>}
    </Stack>} />
    {loading && <LinearProgress aria-label="Loading task details" sx={{ mb: 2 }} />}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}{task && " The last fetched task details are shown below."}</Alert>}
    {operation && <Alert severity={operation.success ? "success" : "error"} sx={{ mb: 2 }}>{operation.text}</Alert>}
    {task && <Grid container spacing={3}>
      <Grid size={{ xs: 12, lg: 5 }}><Stack spacing={3}>
        {task.error_message && <Paper variant="outlined" sx={{ p: 2.5, borderColor: "error.main" }}>
          <Typography component="h2" variant="h6" color="error">Last failure</Typography>
          <Typography variant="caption" color="text.secondary">{timestamp(task.last_failed_at)}</Typography>
          <Box component="pre" sx={{ fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 240, overflow: "auto" }}>{task.error_message}</Box>
          <CopyButton label="Copy error" value={task.error_message} />
        </Paper>}
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}><Typography variant="h6" component="h2">Execution details</Typography><Chip size="small" label={task.state} color={task.state === "completed" ? "success" : task.state === "archived" ? "error" : task.state === "retry" ? "warning" : "default"} /></Stack>
          <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "minmax(100px, 1fr) minmax(0, 2fr)", gap: 1.5 }}>
            {Object.entries({ "Queue": task.queue, "Type": task.type, "Retries used": `${task.retried} / ${task.max_retry}`, "Next process": timestamp(task.next_process_at), "Started": timestamp(task.start_time), "Completed": timestamp(task.completed_at), "Timeout": task.timeout_seconds ? `${task.timeout_seconds} seconds` : "—", "Deadline": timestamp(task.deadline), "Group": task.group || "—", ...(task.state === "completed" ? { "Result retention": task.ttl_seconds > 0 ? `${task.ttl_seconds} seconds left` : "Expired" } : {}) }).map(([label, value]) => <Box key={label} sx={{ display: "contents" }}><Typography component="dt" variant="body2" color="text.secondary">{label}</Typography><Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: "anywhere" }}>{value}</Typography></Box>)}
          </Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>Retries exclude the initial execution. Only the last failure is retained by Asynq.</Typography>
          <CopyButton label="Copy task details" value={JSON.stringify(task, null, 2)} />
        </Paper>
      </Stack></Grid>
      <Grid size={{ xs: 12, lg: 7 }}><Stack spacing={3}><JsonViewer key={`${taskId}-payload`} title="Payload" value={task.payload || ""} /><JsonViewer key={`${taskId}-result`} title="Result" value={task.result || ""} /></Stack></Grid>
    </Grid>}
    <Button component={Link} to={queueDetailsPath(qname)} startIcon={<ArrowBackRounded />} sx={{ mt: 3 }}>Back to queue</Button>
  </Container>;
}
