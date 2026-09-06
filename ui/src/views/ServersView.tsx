import PageHeader from "../components/common/PageHeader";
import React from "react";
import { connect, ConnectedProps } from "react-redux";
import Container from "@mui/material/Container";
import { makeStyles } from "tss-react/mui";

import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import ServersTable from "../components/ServersTable";
import { listServersAsync } from "../actions/serversActions";
import { AppState } from "../store";
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
    loading: state.servers.loading,
    error: state.servers.error,
    servers: state.servers.data,
    pollInterval: state.settings.pollInterval,
  };
}

const connector = connect(mapStateToProps, { listServersAsync });

type Props = ConnectedProps<typeof connector>;

function ServersView(props: Props) {
  const { pollInterval, listServersAsync } = props;
  const { classes } = useStyles();

  usePolling(listServersAsync, pollInterval);

  return (
    <Container maxWidth="lg" className={classes.container}>
      <PageHeader
        title="Servers"
        description="Worker processes and the queues they listen to."
      />
      <Grid container spacing={3}>
        {props.error === "" ? (
          <Grid size={{ xs: 12 }}>
            <Paper className={classes.paper} variant="outlined">
              <Typography variant="h6" className={classes.heading}>
                Servers
              </Typography>
              <ServersTable servers={props.servers} />
            </Paper>
          </Grid>
        ) : (
          <Grid size={{ xs: 12 }}>
            <Alert severity="error">
              <AlertTitle>Error</AlertTitle>
              Could not retrieve servers live data —{" "}
              <strong>See the logs for details</strong>
            </Alert>
          </Grid>
        )}
      </Grid>
    </Container>
  );
}

export default connector(ServersView);
