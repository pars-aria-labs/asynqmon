import React from "react";
import { Box, LinearProgress, Paper, Typography } from "@mui/material";
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

export default function BulkActionProgress() {
  const [operations, setOperations] = React.useState<BulkProgress[]>(
    getBulkProgress(),
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
    <Box
      sx={{
        position: "fixed",
        right: 2,
        bottom: 10,
        zIndex: "snackbar",
        width: 320,
        maxWidth: "calc(100vw - 32px)",
      }}
    >
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
            key={operation.id}
            role="status"
            aria-live="polite"
            sx={{ p: 2, mt: 1 }}
          >
            <Typography variant="body2">
              {labels[operation.action]}: {operation.processed.toLocaleString()}
              {hasTotal
                ? ` / ${operation.total!.toLocaleString()}`
                : ""}
            </Typography>
            <LinearProgress
              variant={hasTotal ? "determinate" : "indeterminate"}
              value={percentage}
              sx={{ mt: 1 }}
            />
          </Paper>
        );
      })}
    </Box>
  );
}
