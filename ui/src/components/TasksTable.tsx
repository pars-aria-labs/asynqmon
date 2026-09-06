import { useURLFilters, positiveInteger } from "../hooks/useURLFilters";
import { rowsPerPageOptions as allowedPageSizes } from "../types/preferences";
import React, { useState, useCallback } from "react";
import { makeStyles } from "tss-react/mui";

import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableFooter from "@mui/material/TableFooter";
import TablePagination from "@mui/material/TablePagination";
import Paper from "@mui/material/Paper";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DeleteIcon from "@mui/icons-material/Delete";
import ArchiveIcon from "@mui/icons-material/Archive";
import CancelIcon from "@mui/icons-material/Cancel";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import TablePaginationActions, {
  rowsPerPageOptions,
} from "./TablePaginationActions";
import TableActions from "./TableActions";
import { usePolling } from "../hooks";
import { TaskInfoExtended } from "../reducers/tasksReducer";
import { TableColumn } from "../types/table";
import { PaginationOptions } from "../api";
import { TaskState } from "../types/taskState";

const useStyles = makeStyles()((theme) => ({
  table: {
    minWidth: 650,
  },
  stickyHeaderCell: {
    background: theme.palette.background.paper,
  },
  alert: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  pagination: {
    border: "none",
  },
}));

interface Props {
  queue: string; // name of the queue.
  totalTaskCount: number; // totoal number of tasks in the given state.
  taskState: TaskState;
  loading: boolean;
  error: string;
  tasks: TaskInfoExtended[];
  batchActionPending: boolean;
  allActionPending: boolean;
  pollInterval: number;
  pageSize: number;
  columns: TableColumn[];

  // actions
  listTasks: (
    qname: string,
    pgn: PaginationOptions,
    signal?: AbortSignal,
  ) => Promise<void>;
  batchDeleteTasks?: (qname: string, taskIds: string[]) => Promise<void>;
  batchRunTasks?: (qname: string, taskIds: string[]) => Promise<void>;
  batchArchiveTasks?: (qname: string, taskIds: string[]) => Promise<void>;
  batchCancelTasks?: (qname: string, taskIds: string[]) => Promise<void>;
  deleteAllTasks?: (qname: string) => Promise<void>;
  runAllTasks?: (qname: string) => Promise<void>;
  archiveAllTasks?: (qname: string) => Promise<void>;
  cancelAllTasks?: (qname: string) => Promise<void>;
  deleteTask?: (qname: string, taskId: string) => Promise<void>;
  runTask?: (qname: string, taskId: string) => Promise<void>;
  archiveTask?: (qname: string, taskId: string) => Promise<void>;
  cancelTask?: (qname: string, taskId: string) => Promise<void>;
  taskRowsPerPageChange: (n: number) => void;

  renderRow: (rowProps: RowProps) => JSX.Element;
}

export default function TasksTable(props: Props) {
  const { pollInterval, listTasks, queue } = props;
  const { classes } = useStyles();
  const { filters, setFilters } = useURLFilters();
  const page = positiveInteger(filters.get("page"), 1) - 1;
  const requestedSize = positiveInteger(filters.get("size"), props.pageSize);
  const pageSize = allowedPageSizes.includes(requestedSize) ? requestedSize : props.pageSize;
  const setPage = (value: number) => setFilters({ page: value === 0 ? null : String(value + 1) });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string>("");

  const handlePageChange = (
    event: React.MouseEvent<HTMLButtonElement> | null,
    newPage: number,
  ) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    props.taskRowsPerPageChange(parseInt(event.target.value, 10));
    setFilters({ size: event.target.value, page: null });
  };

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = props.tasks.map((t) => t.id);
      setSelectedIds(newSelected);
    } else {
      setSelectedIds([]);
    }
  };

  function createAllActionHandler(action: (qname: string) => Promise<void>) {
    return () => action(queue);
  }

  function createBatchActionHandler(
    action: (qname: string, taskIds: string[]) => Promise<void>,
  ) {
    return () => action(queue, selectedIds).then(() => setSelectedIds([]));
  }

  function createSingleActionHandler(
    action: (qname: string, taskId: string) => Promise<void>,
    taskId: string,
  ) {
    return () => action(queue, taskId);
  }

  let allActions = [];
  if (props.deleteAllTasks) {
    allActions.push({
      label: "Delete All",
      onClick: createAllActionHandler(props.deleteAllTasks),
      disabled: props.allActionPending,
    });
  }
  if (props.archiveAllTasks) {
    allActions.push({
      label: "Archive All",
      onClick: createAllActionHandler(props.archiveAllTasks),
      disabled: props.allActionPending,
    });
  }
  if (props.runAllTasks) {
    allActions.push({
      label: "Run All",
      onClick: createAllActionHandler(props.runAllTasks),
      disabled: props.allActionPending,
    });
  }
  if (props.cancelAllTasks) {
    allActions.push({
      label: "Cancel All",
      onClick: createAllActionHandler(props.cancelAllTasks),
      disabled: props.allActionPending,
    });
  }

  let batchActions = [];
  if (props.batchDeleteTasks) {
    batchActions.push({
      tooltip: "Delete",
      icon: <DeleteIcon />,
      disabled: props.batchActionPending,
      onClick: createBatchActionHandler(props.batchDeleteTasks),
    });
  }
  if (props.batchArchiveTasks) {
    batchActions.push({
      tooltip: "Archive",
      icon: <ArchiveIcon />,
      disabled: props.batchActionPending,
      onClick: createBatchActionHandler(props.batchArchiveTasks),
    });
  }
  if (props.batchRunTasks) {
    batchActions.push({
      tooltip: "Run",
      icon: <PlayArrowIcon />,
      disabled: props.batchActionPending,
      onClick: createBatchActionHandler(props.batchRunTasks),
    });
  }
  if (props.batchCancelTasks) {
    batchActions.push({
      tooltip: "Cancel",
      icon: <CancelIcon />,
      disabled: props.batchActionPending,
      onClick: createBatchActionHandler(props.batchCancelTasks),
    });
  }

  const fetchData = useCallback((signal: AbortSignal) => {
    const pageOpts = { page: page + 1, size: pageSize };
    return listTasks(queue, pageOpts, signal);
  }, [page, pageSize, queue, listTasks]);

  usePolling(fetchData, pollInterval);

  if (props.error.length > 0) {
    return (
      <Alert severity="error" className={classes.alert}>
        <AlertTitle>Error</AlertTitle>
        {props.error}
      </Alert>
    );
  }
  if (props.tasks.length === 0) {
    return (
      <Alert severity="info" className={classes.alert}>
        <AlertTitle>Info</AlertTitle>
        {props.taskState === "aggregating" ? (
          <div>Selected group is empty.</div>
        ) : (
          <div>No {props.taskState} tasks at this time.</div>
        )}
      </Alert>
    );
  }

  const rowCount = props.tasks.length;
  const numSelected = selectedIds.length;
  return (
    <div>
      {!window.READ_ONLY && (
        <TableActions
          showIconButtons={numSelected > 0}
          iconButtonActions={batchActions}
          menuItemActions={allActions}
        />
      )}
      <TableContainer component={Paper}>
        <Table
          stickyHeader={true}
          className={classes.table}
          aria-label={`${props.taskState} tasks table`}
          size="small"
        >
          <TableHead>
            <TableRow>
              {!window.READ_ONLY && (
                <TableCell
                  padding="checkbox"
                  classes={{ stickyHeader: classes.stickyHeaderCell }}
                >
                  <IconButton>
                    <Checkbox
                      indeterminate={numSelected > 0 && numSelected < rowCount}
                      checked={rowCount > 0 && numSelected === rowCount}
                      onChange={handleSelectAllClick}
                      inputProps={{
                        "aria-label": "select all tasks shown in the table",
                      }}
                    />
                  </IconButton>
                </TableCell>
              )}
              {props.columns
                .filter((col) => {
                  // Filter out actions column in readonly mode.
                  return !window.READ_ONLY || col.key !== "actions";
                })
                .map((col) => (
                  <TableCell
                    key={col.label}
                    align={col.align}
                    classes={{ stickyHeader: classes.stickyHeaderCell }}
                  >
                    {col.label}
                  </TableCell>
                ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {props.tasks.map((task) => {
              return props.renderRow({
                key: task.id,
                task: task,
                allActionPending: props.allActionPending,
                isSelected: selectedIds.includes(task.id),
                onSelectChange: (checked: boolean) => {
                  if (checked) {
                    setSelectedIds(selectedIds.concat(task.id));
                  } else {
                    setSelectedIds(selectedIds.filter((id) => id !== task.id));
                  }
                },
                onRunClick: props.runTask
                  ? createSingleActionHandler(props.runTask, task.id)
                  : undefined,
                onDeleteClick: props.deleteTask
                  ? createSingleActionHandler(props.deleteTask, task.id)
                  : undefined,
                onArchiveClick: props.archiveTask
                  ? createSingleActionHandler(props.archiveTask, task.id)
                  : undefined,
                onCancelClick: props.cancelTask
                  ? createSingleActionHandler(props.cancelTask, task.id)
                  : undefined,
                onActionCellEnter: () => setActiveTaskId(task.id),
                onActionCellLeave: () => setActiveTaskId(""),
                showActions: activeTaskId === task.id,
              });
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TablePagination
                rowsPerPageOptions={rowsPerPageOptions}
                colSpan={props.columns.length + 1}
                count={props.totalTaskCount}
                rowsPerPage={pageSize}
                page={page}
                SelectProps={{
                  inputProps: { "aria-label": "rows per page" },
                  native: true,
                }}
                onPageChange={handlePageChange}
                onRowsPerPageChange={handleRowsPerPageChange}
                ActionsComponent={TablePaginationActions}
                className={classes.pagination}
              />
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
    </div>
  );
}

export const useRowStyles = makeStyles()((theme) => ({
  root: {
    cursor: "pointer",
    "& #copy-button": {
      display: "none",
    },
    "&:hover": {
      boxShadow: theme.shadows[2],
      "& #copy-button": {
        display: "inline-block",
      },
    },
    "&:hover .task-copy-button": {
      display: "inline-block",
    },
    "&:hover .MuiTableCell-root": {
      borderBottomColor: theme.palette.background.paper,
    },
  },
  actionCell: {
    width: "140px",
  },
  actionButton: {
    marginLeft: 3,
    marginRight: 3,
  },
  idCell: {
    width: "200px",
  },
  copyButton: {
    display: "none",
  },
  IdGroup: {
    display: "flex",
    alignItems: "center",
  },
}));

export interface RowProps {
  key: string;
  task: TaskInfoExtended;
  isSelected: boolean;
  onSelectChange: (checked: boolean) => void;
  onRunClick?: () => void;
  onDeleteClick?: () => void;
  onArchiveClick?: () => void;
  onCancelClick?: () => void;
  allActionPending: boolean;
  showActions: boolean;
  onActionCellEnter: () => void;
  onActionCellLeave: () => void;
}
