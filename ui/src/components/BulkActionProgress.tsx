import React from "react";
import LinearProgress from "@material-ui/core/LinearProgress";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import { makeStyles, Theme } from "@material-ui/core/styles";
import {
  BulkAction,
  BulkProgress,
  getBulkProgress,
  subscribeBulkProgress,
} from "../bulkActions";

const labels: Record<BulkAction, string> = {
  delete: "Deleting tasks",
  run: "Scheduling tasks",
  archive: "Archiving tasks",
};

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    position: "fixed",
    right: theme.spacing(2),
    bottom: theme.spacing(10),
    zIndex: theme.zIndex.snackbar,
    width: 320,
    maxWidth: "calc(100vw - 32px)",
  },
  operation: {
    padding: theme.spacing(2),
    marginTop: theme.spacing(1),
  },
  progress: {
    marginTop: theme.spacing(1),
  },
}));

export default function BulkActionProgress() {
  const classes = useStyles();
  const [operations, setOperations] = React.useState<BulkProgress[]>(
    getBulkProgress()
  );

  React.useEffect(
    () =>
      subscribeBulkProgress(() => {
        setOperations(getBulkProgress());
      }),
    []
  );

  if (operations.length === 0) {
    return null;
  }

  return (
    <div className={classes.container}>
      {operations.map((operation) => {
        const hasTotal = operation.total !== undefined;
        const percentage =
          operation.total === 0
            ? 100
            : operation.total === undefined
            ? undefined
            : Math.min(100, (100 * operation.processed) / operation.total);
        return (
          <Paper
            className={classes.operation}
            key={operation.id}
            role="status"
            aria-live="polite"
          >
            <Typography variant="body2">
              {labels[operation.action]}: {operation.processed.toLocaleString()}
              {hasTotal
                ? ` / ${operation.total!.toLocaleString()}`
                : ""}
            </Typography>
            <LinearProgress
              className={classes.progress}
              variant={hasTotal ? "determinate" : "indeterminate"}
              value={percentage}
            />
          </Paper>
        );
      })}
    </div>
  );
}
