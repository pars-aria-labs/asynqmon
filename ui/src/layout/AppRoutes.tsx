import { lazy, Suspense } from "react";
import { Route, Switch } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { paths as getPaths } from "../paths";

const Dashboard = lazy(() => import("../views/DashboardView"));
const Tasks = lazy(() => import("../views/TasksView"));
const TaskDetails = lazy(() => import("../views/TaskDetailsView"));
const Schedulers = lazy(() => import("../views/SchedulersView"));
const Servers = lazy(() => import("../views/ServersView"));
const Redis = lazy(() => import("../views/RedisInfoView"));
const Metrics = lazy(() => import("../views/MetricsView"));
const Settings = lazy(() => import("../views/SettingsView"));
const NotFound = lazy(() => import("../views/PageNotFoundView"));

export default function AppRoutes() {
  const paths = getPaths();
  return (
    <Suspense
      fallback={
        <Box sx={{ p: 8, textAlign: "center" }}>
          <CircularProgress aria-label="Loading page" />
        </Box>
      }
    >
      <Switch>
        <Route exact path={paths.TASK_DETAILS} component={TaskDetails} />
        <Route exact path={paths.QUEUE_DETAILS} component={Tasks} />
        <Route exact path={paths.SCHEDULERS} component={Schedulers} />
        <Route exact path={paths.SERVERS} component={Servers} />
        <Route exact path={paths.REDIS} component={Redis} />
        <Route exact path={paths.SETTINGS} component={Settings} />
        <Route exact path={paths.HOME} component={Dashboard} />
        <Route exact path={paths.QUEUE_METRICS} component={Metrics} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}
