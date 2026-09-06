import React, { useEffect } from "react";
import { connect, ConnectedProps } from "react-redux";
import { makeStyles } from "tss-react/mui";

import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import TasksTableContainer from "../components/TasksTableContainer";
import QueueInfoBanner from "../components/QueueInfoBanner";
import QueueBreadCrumb from "../components/QueueBreadcrumb";
import { useParams } from "react-router-dom";
import { listQueuesAsync } from "../actions/queuesActions";
import { AppState } from "../store";
import { QueueDetailsRouteParams } from "../paths";
import { useQuery } from "../hooks";

function mapStateToProps(state: AppState) {
  return {
    queues: state.queues.data.map((q) => q.name),
  };
}

const connector = connect(mapStateToProps, { listQueuesAsync });

const useStyles = makeStyles()((theme) => ({
  container: {
    paddingTop: theme.spacing(2),
  },
  breadcrumbs: {
    marginBottom: theme.spacing(2),
  },
  banner: {
    marginBottom: theme.spacing(2),
  },
  tasksTable: {
    marginBottom: theme.spacing(4),
  },
}));

const validStatus = [
  "active",
  "pending",
  "aggregating",
  "scheduled",
  "retry",
  "archived",
  "completed",
];
const defaultStatus = "active";

function TasksView(props: ConnectedProps<typeof connector>) {
  const { classes } = useStyles();
  const { qname } = useParams<QueueDetailsRouteParams>();
  const query = useQuery();
  let selected = query.get("status");
  if (!selected || !validStatus.includes(selected)) {
    selected = defaultStatus;
  }
  const { listQueuesAsync } = props;

  useEffect(() => {
    const controller = new AbortController();
    void listQueuesAsync(controller.signal);
    return () => controller.abort();
  }, [listQueuesAsync]);

  return (
    <Container maxWidth="lg">
      <Grid container spacing={0} className={classes.container}>
        <Grid className={classes.breadcrumbs} size={{ xs: 12 }}>
          <QueueBreadCrumb queues={props.queues} queueName={qname} />
        </Grid>
        <Grid className={classes.banner} size={{ xs: 12 }}>
          <QueueInfoBanner qname={qname} />
        </Grid>
        <Grid className={classes.tasksTable} size={{ xs: 12 }}>
          <TasksTableContainer queue={qname} selected={selected} />
        </Grid>
      </Grid>
    </Container>
  );
}

export default connector(TasksView);
