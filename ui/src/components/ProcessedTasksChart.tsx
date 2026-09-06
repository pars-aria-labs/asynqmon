import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useTheme, Theme } from "@mui/material/styles";

interface Props {
  data: ProcessedStats[];
}

interface ProcessedStats {
  queue: string; // name of the queue.
  succeeded: number; // number of tasks succeeded.
  failed: number; // number of tasks failed.
}

function ProcessedTasksChart(props: Props) {
  const theme = useTheme<Theme>();
  return (
    <ResponsiveContainer>
      <BarChart data={props.data} maxBarSize={120}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke={theme.palette.divider}
        />
        <XAxis
          tick={{ fontSize: 11 }}
          dataKey="queue"
          stroke={theme.palette.text.secondary}
        />
        <YAxis
          width={42}
          tick={{ fontSize: 11 }}
          stroke={theme.palette.text.secondary}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: theme.palette.background.paper,
            borderColor: theme.palette.divider,
            borderRadius: 10,
            color: theme.palette.text.primary,
          }}
        />
        <Legend />
        <Bar
          isAnimationActive={false}
          dataKey="succeeded"
          stackId="a"
          fill={theme.palette.success.light}
        />
        <Bar
          isAnimationActive={false}
          dataKey="failed"
          stackId="a"
          fill={theme.palette.error.light}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default ProcessedTasksChart;
