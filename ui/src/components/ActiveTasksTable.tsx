import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import CancelIcon from "@mui/icons-material/Cancel";
import FileCopyOutlinedIcon from "@mui/icons-material/FileCopyOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import React from "react";
import { connect, ConnectedProps } from "react-redux";
import { useHistory } from "react-router-dom";
import { taskRowsPerPageChange } from "../actions/settingsActions";
import {
  batchCancelActiveTasksAsync,
  cancelActiveTaskAsync,
  cancelAllActiveTasksAsync,
  listActiveTasksAsync,
} from "../actions/tasksActions";
import { taskDetailsPath } from "../paths";
import { AppState } from "../store";
import { TableColumn } from "../types/table";
import { durationBefore, prettifyPayload, timeAgo, uuidPrefix } from "../utils";
import SyntaxHighlighter from "./SyntaxHighlighter";
import TasksTable, { RowProps, useRowStyles } from "./TasksTable";

function mapStateToProps(state: AppState) {
  return {
    loading: state.tasks.activeTasks.loading,
    error: state.tasks.activeTasks.error,
    tasks: state.tasks.activeTasks.data,
    batchActionPending: state.tasks.activeTasks.batchActionPending,
    allActionPending: state.tasks.activeTasks.allActionPending,
    pollInterval: state.settings.pollInterval,
    pageSize: state.settings.taskRowsPerPage,
  };
}

const mapDispatchToProps = {
  listTasks: listActiveTasksAsync,
  cancelTask: cancelActiveTaskAsync,
  batchCancelTasks: batchCancelActiveTasksAsync,
  cancelAllTasks: cancelAllActiveTasksAsync,
  taskRowsPerPageChange,
};

const columns: TableColumn[] = [
  { key: "id", label: "ID", align: "left" },
  { key: "type", label: "Type", align: "left" },
  { key: "payload", label: "Payload", align: "left" },
  { key: "status", label: "Status", align: "left" },
  { key: "start-time", label: "Started", align: "left" },
  { key: "deadline", label: "Deadline", align: "left" },
  { key: "actions", label: "Actions", align: "center" },
];

const connector = connect(mapStateToProps, mapDispatchToProps);

type ReduxProps = ConnectedProps<typeof connector>;

interface Props {
  queue: string; // name of the queue
  totalTaskCount: number; // total number of active tasks
}

function Row(props: RowProps) {
  const { task } = props;
  const { classes } = useRowStyles();
  const history = useHistory();
  return (
    <TableRow
      key={task.id}
      className={classes.root}
      selected={props.isSelected}
      onClick={() => history.push(taskDetailsPath(task.queue, task.id))}
    >
      {!window.READ_ONLY && (
        <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
          <IconButton>
            <Checkbox
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                props.onSelectChange(event.target.checked)
              }
              checked={props.isSelected}
            />
          </IconButton>
        </TableCell>
      )}
      <TableCell component="th" scope="row" className={classes.idCell}>
        <div className={classes.IdGroup}>
          {uuidPrefix(task.id)}
          <Tooltip title="Copy full ID to clipboard">
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(task.id);
              }}
              size="small"
              className={`${classes.copyButton} task-copy-button`}
            >
              <FileCopyOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </TableCell>
      <TableCell>{task.type}</TableCell>
      <TableCell>
        <SyntaxHighlighter
          language="json"
          customStyle={{ margin: 0, maxWidth: 400 }}
        >
          {prettifyPayload(task.payload)}
        </SyntaxHighlighter>
      </TableCell>
      <TableCell>
        {task.canceling
          ? "Canceling"
          : task.is_orphaned
            ? "Orphaned"
            : "Running"}
      </TableCell>
      <TableCell>
        {task.is_orphaned
          ? "-"
          : task.start_time === "-"
            ? "just now"
            : timeAgo(task.start_time)}
      </TableCell>
      <TableCell>
        {task.deadline === "-" ? "-" : durationBefore(task.deadline)}
      </TableCell>
      {!window.READ_ONLY && (
        <TableCell
          align="center"
          onMouseEnter={props.onActionCellEnter}
          onMouseLeave={props.onActionCellLeave}
          onClick={(e) => e.stopPropagation()}
        >
          {props.showActions ? (
            <React.Fragment>
              <Tooltip title="Cancel">
                <IconButton
                  onClick={props.onCancelClick}
                  disabled={
                    task.requestPending || task.canceling || task.is_orphaned
                  }
                  size="small"
                >
                  <CancelIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </React.Fragment>
          ) : (
            <IconButton size="small" onClick={props.onActionCellEnter}>
              <MoreHorizIcon fontSize="small" />
            </IconButton>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

function ActiveTasksTable(props: Props & ReduxProps) {
  return (
    <TasksTable
      taskState="active"
      columns={columns}
      renderRow={(rowProps: RowProps) => <Row {...rowProps} />}
      {...props}
    />
  );
}

export default connector(ActiveTasksTable);
