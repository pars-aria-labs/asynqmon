import React from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { Queue } from "../api";

interface QueueWithRequestState extends Queue {
  requestPending: boolean;
}

interface Props {
  queue: QueueWithRequestState | null; // queue to delete
  onClose: () => void;
  onDelete: (qname: string) => Promise<void>;
}

export default function DeleteQueueConfirmationDialog(props: Props) {
  const handleDeleteClick = async () => {
    if (!props.queue) {
      return;
    }
    await props.onDelete(props.queue.queue);
    props.onClose();
  };
  return (
    <Dialog
      open={props.queue !== null}
      onClose={props.onClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      {props.queue !== null &&
        (props.queue.size > 0 ? (
          <>
            <DialogTitle id="alert-dialog-title">
              Queue is not empty
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="alert-dialog-description">
                You are trying to delete a non-empty queue "{props.queue.queue}
                ". Please empty the queue first before deleting.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={props.onClose} color="primary">
                OK
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle id="alert-dialog-title">
              Are you sure you want to delete "{props.queue.queue}"?
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="alert-dialog-description">
                You can't undo this action.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={props.onClose}
                disabled={props.queue.requestPending}
                color="primary"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleDeleteClick()}
                disabled={props.queue.requestPending}
                color="primary"
                autoFocus
              >
                Delete
              </Button>
            </DialogActions>
          </>
        ))}
    </Dialog>
  );
}
