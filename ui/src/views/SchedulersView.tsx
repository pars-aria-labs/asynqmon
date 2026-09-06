import PageHeader from "../components/common/PageHeader";
import React from "react";
import { connect, ConnectedProps } from "react-redux";
import Container from "@mui/material/Container";
import { makeStyles } from "tss-react/mui";

import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import SchedulerEntriesTable from "../components/SchedulerEntriesTable";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import { AppState } from "../store";
import { listSchedulerEntriesAsync } from "../actions/schedulerEntriesActions";
import { usePolling } from "../hooks";

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
  heading: {
    paddingLeft: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
}));

function mapStateToProps(state: AppState) {
  return {
    loading: state.schedulerEntries.loading,
    error: state.schedulerEntries.error,
    entries: state.schedulerEntries.data,
    pollInterval: state.settings.pollInterval,
  };
}

const connector = connect(mapStateToProps, { listSchedulerEntriesAsync });

type Props = ConnectedProps<typeof connector>;

function SchedulersView(props: Props) {
  const { pollInterval, listSchedulerEntriesAsync } = props;
  const { classes } = useStyles();

  usePolling(listSchedulerEntriesAsync, pollInterval);

  return (
    <Container maxWidth="lg" className={classes.container}>
      <PageHeader
        title="Schedulers"
        description="Recurring tasks and their upcoming runs."
      />
      <Grid container spacing={3}>
        {props.error === "" ? (
          <Grid size={{ xs: 12 }}>
            <Paper className={classes.paper} variant="outlined">
              <Typography variant="h6" className={classes.heading}>
                Scheduler Entries
              </Typography>
              <SchedulerEntriesTable entries={props.entries} />
            </Paper>
          </Grid>
        ) : (
          <Grid size={{ xs: 12 }}>
            <Alert severity="error">
              <AlertTitle>Error</AlertTitle>
              Could not retrieve scheduler entries live data —{" "}
              <strong>See the logs for details</strong>
            </Alert>
          </Grid>
        )}
      </Grid>
    </Container>
  );
}

export default connector(SchedulersView);
