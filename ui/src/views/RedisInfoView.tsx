import PageHeader from "../components/common/PageHeader";
import React from "react";
import { connect, ConnectedProps } from "react-redux";
import Container from "@mui/material/Container";
import { makeStyles } from "tss-react/mui";

import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import SyntaxHighlighter from "../components/SyntaxHighlighter";
import { getRedisInfoAsync } from "../actions/redisInfoActions";
import { usePolling } from "../hooks";
import { AppState } from "../store";
import { timeAgoUnix } from "../utils";
import { RedisInfo } from "../api";
import QueueLocationTable from "../components/QueueLocationTable";
import Link from "@mui/material/Link";

const useStyles = makeStyles()((theme) => ({
  container: {
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(4),
  },
}));

function mapStateToProps(state: AppState) {
  return {
    loading: state.redis.loading,
    error: state.redis.error,
    redisInfo: state.redis.data,
    redisAddress: state.redis.address,
    redisInfoRaw: state.redis.rawData,
    redisClusterEnabled: state.redis.cluster,
    redisClusterNodesRaw: state.redis.rawClusterNodes,
    queueLocations: state.redis.queueLocations,
    pollInterval: state.settings.pollInterval,
    themePreference: state.settings.themePreference,
  };
}

const connector = connect(mapStateToProps, { getRedisInfoAsync });
type Props = ConnectedProps<typeof connector>;

function RedisInfoView(props: Props) {
  const { classes } = useStyles();
  const {
    pollInterval,
    getRedisInfoAsync,
    redisInfo,
    redisInfoRaw,
    redisClusterEnabled,
    redisClusterNodesRaw,
    queueLocations,
  } = props;
  usePolling(getRedisInfoAsync, pollInterval);

  // Metrics to show
  // - Used Memory
  // - Memory Fragmentation Ratio
  // - Connected Clients
  // - Connected Replicas (slaves)
  // - Persistence (rdb_last_save_time, rdb_changes_since_last_save)
  // - Errors (rejected_connections)

  return (
    <Container maxWidth="lg" className={classes.container}>
      <PageHeader
        title="Redis"
        description="Connection details and Redis server information."
      />
      <Grid container spacing={3}>
        {props.error === "" ? (
          <>
            <Grid size={{ xs: 12 }}>
              <Typography variant="h5" color="textPrimary">
                {redisClusterEnabled ? "Redis Cluster Info" : "Redis Info"}
              </Typography>
              {!redisClusterEnabled && (
                <Typography variant="subtitle1" color="textSecondary">
                  Connected to: {props.redisAddress}
                </Typography>
              )}
            </Grid>
            {queueLocations && queueLocations.length > 0 && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="h6" color="textSecondary">
                  Queue Location in Cluster
                </Typography>
                <QueueLocationTable queueLocations={queueLocations} />
              </Grid>
            )}
            {redisClusterNodesRaw && (
              <>
                <Grid size={{ xs: 12 }}>
                  <Typography variant="h6" color="textSecondary">
                    <Link
                      href="https://redis.io/commands/cluster-nodes"
                      target="_"
                    >
                      CLUSTER NODES
                    </Link>{" "}
                    Command Output
                  </Typography>
                  <SyntaxHighlighter language="yaml">
                    {redisClusterNodesRaw}
                  </SyntaxHighlighter>
                </Grid>
              </>
            )}
            {redisInfo && !redisClusterEnabled && (
              <RedisMetricCards redisInfo={redisInfo} />
            )}
            {redisInfoRaw && (
              <>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="h6" color="textSecondary">
                    {redisClusterEnabled ? (
                      <Link
                        href="https://redis.io/commands/cluster-info"
                        target="_"
                      >
                        CLUSTER INFO
                      </Link>
                    ) : (
                      <Link href="https://redis.io/commands/info" target="_">
                        INFO
                      </Link>
                    )}{" "}
                    Command Output
                  </Typography>
                  <SyntaxHighlighter language="yaml">
                    {redisInfoRaw}
                  </SyntaxHighlighter>
                </Grid>
              </>
            )}
          </>
        ) : (
          <Grid size={{ xs: 12 }}>
            <Alert severity="error">
              <AlertTitle>Error</AlertTitle>
              Could not retrieve redis live data —{" "}
              <strong>See the logs for details</strong>
            </Alert>
          </Grid>
        )}
      </Grid>
    </Container>
  );
}

function RedisMetricCards(props: { redisInfo: RedisInfo }) {
  const { redisInfo } = props;
  return (
    <>
      <Grid size={{ xs: 12 }}>
        <Typography variant="h6" color="textSecondary">
          Server
        </Typography>
      </Grid>
      <Grid size={{ xs: 3 }}>
        <MetricCard title="Version" content={redisInfo.redis_version} />
      </Grid>
      <Grid size={{ xs: 3 }}>
        <MetricCard
          title="Uptime"
          content={`${redisInfo.uptime_in_days} days`}
        />
      </Grid>
      <Grid size={{ xs: 6 }} />
      <Grid size={{ xs: 12 }}>
        <Typography variant="h6" color="textSecondary">
          Memory
        </Typography>
      </Grid>
      <Grid size={{ xs: 3 }}>
        <MetricCard title="Used Memory" content={redisInfo.used_memory_human} />
      </Grid>
      <Grid size={{ xs: 3 }}>
        <MetricCard
          title="Peak Memory Used"
          content={redisInfo.used_memory_peak_human}
        />
      </Grid>
      <Grid size={{ xs: 3 }}>
        <MetricCard
          title="Memory Fragmentation Ratio"
          content={redisInfo.mem_fragmentation_ratio}
        />
      </Grid>
      <Grid size={{ xs: 3 }} />
      <Grid size={{ xs: 12 }}>
        <Typography variant="h6" color="textSecondary">
          Connections
        </Typography>
      </Grid>
      <Grid size={{ xs: 3 }}>
        <MetricCard
          title="Connected Clients"
          content={redisInfo.connected_clients}
        />
      </Grid>
      <Grid size={{ xs: 3 }}>
        <MetricCard
          title="Connected Replicas"
          content={redisInfo.connected_slaves}
        />
      </Grid>
      <Grid size={{ xs: 6 }} />
      <Grid size={{ xs: 12 }}>
        <Typography variant="h6" color="textSecondary">
          Persistence
        </Typography>
      </Grid>
      <Grid size={{ xs: 3 }}>
        <MetricCard
          title="Last Save to Disk"
          content={timeAgoUnix(parseInt(redisInfo.rdb_last_save_time))}
        />
      </Grid>
      <Grid size={{ xs: 3 }}>
        <MetricCard
          title="Number of Changes Since Last Dump"
          content={redisInfo.rdb_changes_since_last_save}
        />
      </Grid>
      <Grid size={{ xs: 6 }} />
    </>
  );
}

interface MetricCardProps {
  title: string;
  content: string;
}

function MetricCard(props: MetricCardProps) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography
          gutterBottom
          color="textPrimary"
          variant="h5"
          align="center"
        >
          {props.content}
        </Typography>
        <Typography color="textSecondary" variant="subtitle2" align="center">
          {props.title}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default connector(RedisInfoView);
