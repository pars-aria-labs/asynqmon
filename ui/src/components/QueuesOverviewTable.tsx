import { useURLFilters } from "../hooks/useURLFilters";
import Chip from "@mui/material/Chip";
import React, { useState } from "react";
import clsx from "clsx";
import { Link } from "react-router-dom";
import { makeStyles } from "tss-react/mui";

import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import PauseCircleFilledIcon from "@mui/icons-material/PauseCircleFilled";
import PlayCircleFilledIcon from "@mui/icons-material/PlayCircleFilled";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteQueueConfirmationDialog from "./DeleteQueueConfirmationDialog";
import { Queue } from "../api";
import { queueDetailsPath } from "../paths";
import { SortDirection, SortableTableColumn } from "../types/table";
import prettyBytes from "pretty-bytes";
import { percentage } from "../utils";

const useStyles = makeStyles()((theme) => ({
  table: {
    minWidth: 650,
  },
  fixedCell: {
    position: "sticky",
    zIndex: 1,
    left: 0,
    background: theme.palette.background.paper,
  },
}));

interface QueueWithMetadata extends Queue {
  requestPending: boolean; // indicates pause/resume/delete request is pending for the queue.
}

interface Props {
  queues: QueueWithMetadata[];
  onPauseClick: (qname: string) => Promise<void>;
  onResumeClick: (qname: string) => Promise<void>;
  onDeleteClick: (qname: string) => Promise<void>;
}

enum SortBy {
  Queue,
  State,
  Size,
  MemoryUsage,
  Latency,
  Processed,
  Failed,
  ErrorRate,

  None, // no sort support
}

const colConfigs: SortableTableColumn<SortBy>[] = [
  { label: "Queue", key: "queue", sortBy: SortBy.Queue, align: "left" },
  { label: "State", key: "state", sortBy: SortBy.State, align: "left" },
  {
    label: "Size",
    key: "size",
    sortBy: SortBy.Size,
    align: "right",
  },
  {
    label: "Memory usage",
    key: "memory_usage",
    sortBy: SortBy.MemoryUsage,
    align: "right",
  },
  {
    label: "Latency",
    key: "latency",
    sortBy: SortBy.Latency,
    align: "right",
  },
  {
    label: "Processed",
    key: "processed",
    sortBy: SortBy.Processed,
    align: "right",
  },
  { label: "Failed", key: "failed", sortBy: SortBy.Failed, align: "right" },
  {
    label: "Error rate",
    key: "error_rate",
    sortBy: SortBy.ErrorRate,
    align: "right",
  },
  { label: "Actions", key: "actions", sortBy: SortBy.None, align: "center" },
];

// sortQueues takes a array of queues and return a sorted array.
// It returns a new array and leave the original array untouched.
function sortQueues(
  queues: QueueWithMetadata[],
  cmpFn: (first: QueueWithMetadata, second: QueueWithMetadata) => number,
): QueueWithMetadata[] {
  let copy = [...queues];
  copy.sort(cmpFn);
  return copy;
}

export default function QueuesOverviewTable(props: Props) {
  const { classes } = useStyles();
  const { filters, setFilters } = useURLFilters();
  const sortBy = colConfigs.find(c => c.key === filters.get("sort") && c.sortBy !== SortBy.None)?.sortBy ?? SortBy.Queue;
  const sortDir = filters.get("direction") === "desc" ? SortDirection.Desc : SortDirection.Asc;
  const [queueToDelete, setQueueToDelete] = useState<QueueWithMetadata | null>(
    null,
  );
  const createSortClickHandler = (sortKey: SortBy) => (e: React.MouseEvent) => {
    if (sortKey === sortBy) {
      // Toggle sort direction.
      const nextSortDir =
        sortDir === SortDirection.Asc ? SortDirection.Desc : SortDirection.Asc;
      setFilters({ direction: nextSortDir });
    } else {
      // Change the sort key.
      setFilters({ sort: colConfigs.find(c => c.sortBy === sortKey)!.key });
    }
  };

  const cmpFunc = (q1: QueueWithMetadata, q2: QueueWithMetadata): number => {
    let isQ1Smaller: boolean;
    switch (sortBy) {
      case SortBy.Queue:
        if (q1.queue === q2.queue) return 0;
        isQ1Smaller = q1.queue < q2.queue;
        break;
      case SortBy.State:
        if (q1.paused === q2.paused) return 0;
        isQ1Smaller = !q1.paused;
        break;
      case SortBy.Size:
        if (q1.size === q2.size) return 0;
        isQ1Smaller = q1.size < q2.size;
        break;
      case SortBy.MemoryUsage:
        if (q1.memory_usage_bytes === q2.memory_usage_bytes) return 0;
        isQ1Smaller = q1.memory_usage_bytes < q2.memory_usage_bytes;
        break;
      case SortBy.Latency:
        if (q1.latency_msec === q2.latency_msec) return 0;
        isQ1Smaller = q1.latency_msec < q2.latency_msec;
        break;
      case SortBy.Processed:
        if (q1.processed === q2.processed) return 0;
        isQ1Smaller = q1.processed < q2.processed;
        break;
      case SortBy.Failed:
        if (q1.failed === q2.failed) return 0;
        isQ1Smaller = q1.failed < q2.failed;
        break;
      case SortBy.ErrorRate:
        const q1ErrorRate = q1.failed / q1.processed;
        const q2ErrorRate = q2.failed / q2.processed;
        if (q1ErrorRate === q2ErrorRate) return 0;
        isQ1Smaller = q1ErrorRate < q2ErrorRate;
        break;
      default:
        // eslint-disable-next-line no-throw-literal
        throw `Unexpected order by value: ${sortBy}`;
    }
    if (sortDir === SortDirection.Asc) {
      return isQ1Smaller ? -1 : 1;
    } else {
      return isQ1Smaller ? 1 : -1;
    }
  };

  const handleDialogClose = () => {
    setQueueToDelete(null);
  };
  const currentQueueToDelete = queueToDelete
    ? props.queues.find((queue) => queue.queue === queueToDelete.queue) ??
      queueToDelete
    : null;

  return (
    <React.Fragment>
      <TableContainer>
        <Table className={classes.table} aria-label="queues overview table">
          <TableHead>
            <TableRow>
              {colConfigs
                .filter((cfg) => {
                  // Filter out actions column in readonly mode.
                  return !window.READ_ONLY || cfg.key !== "actions";
                })
                .map((cfg, i) => (
                  <TableCell
                    key={cfg.key}
                    align={cfg.align}
                    className={clsx(i === 0 && classes.fixedCell)}
                  >
                    {cfg.sortBy !== SortBy.None ? (
                      <TableSortLabel
                        active={sortBy === cfg.sortBy}
                        direction={sortDir}
                        onClick={createSortClickHandler(cfg.sortBy)}
                      >
                        {cfg.label}
                      </TableSortLabel>
                    ) : (
                      <div>{cfg.label}</div>
                    )}
                  </TableCell>
                ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortQueues(props.queues, cmpFunc).map((q) => (
              <Row
                key={q.queue}
                queue={q}
                onPauseClick={() => props.onPauseClick(q.queue)}
                onResumeClick={() => props.onResumeClick(q.queue)}
                onDeleteClick={() => setQueueToDelete(q)}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <DeleteQueueConfirmationDialog
        onClose={handleDialogClose}
        queue={currentQueueToDelete}
        onDelete={props.onDeleteClick}
      />
    </React.Fragment>
  );
}

const useRowStyles = makeStyles()((theme) => ({
  row: {
    "&:last-child td": {
      borderBottomWidth: 0,
    },
    "&:last-child th": {
      borderBottomWidth: 0,
    },
  },
  linkText: {
    textDecoration: "none",
    color: theme.palette.text.primary,
    "&:hover": {
      textDecoration: "underline",
    },
  },
  textGreen: {
    color: theme.palette.success.dark,
  },
  textRed: {
    color: theme.palette.error.dark,
  },
  boldCell: {
    fontWeight: 600,
  },
  fixedCell: {
    position: "sticky",
    zIndex: 1,
    left: 0,
    background: theme.palette.background.paper,
  },
  actionIconsContainer: {
    display: "flex",
    justifyContent: "center",
    minWidth: "100px",
  },
}));

interface RowProps {
  queue: QueueWithMetadata;
  onPauseClick: () => void;
  onResumeClick: () => void;
  onDeleteClick: () => void;
}

function Row(props: RowProps) {
  const { classes } = useRowStyles();
  const { queue: q } = props;
  return (
    <TableRow key={q.queue} className={classes.row}>
      <TableCell
        component="th"
        scope="row"
        className={clsx(classes.boldCell, classes.fixedCell)}
      >
        <Link to={queueDetailsPath(q.queue)} className={classes.linkText}>
          {q.queue}
        </Link>
      </TableCell>
      <TableCell>
        <Chip
          size="small"
          label={q.paused ? "Paused" : "Running"}
          color={q.paused ? "warning" : "success"}
          variant="outlined"
        />
      </TableCell>
      <TableCell align="right">{q.size}</TableCell>
      <TableCell align="right">{prettyBytes(q.memory_usage_bytes)}</TableCell>
      <TableCell align="right">{q.display_latency}</TableCell>
      <TableCell align="right">{q.processed}</TableCell>
      <TableCell align="right">{q.failed}</TableCell>
      <TableCell align="right">{percentage(q.failed, q.processed)}</TableCell>
      {!window.READ_ONLY && (
        <TableCell align="center">
          <div className={classes.actionIconsContainer}>
            <React.Fragment>
              {q.paused ? (
                <Tooltip title="Resume">
                  <IconButton
                    color="secondary"
                    aria-label={`Resume ${q.queue}`}
                    onClick={props.onResumeClick}
                    disabled={q.requestPending}
                    size="small"
                  >
                    <PlayCircleFilledIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : (
                <Tooltip title="Pause">
                  <IconButton
                    color="primary"
                    aria-label={`Pause ${q.queue}`}
                    onClick={props.onPauseClick}
                    disabled={q.requestPending}
                    size="small"
                  >
                    <PauseCircleFilledIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Delete">
                <IconButton
                  aria-label={`Delete ${q.queue}`}
                  onClick={props.onDeleteClick}
                  disabled={q.requestPending}
                  size="small"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </React.Fragment>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
