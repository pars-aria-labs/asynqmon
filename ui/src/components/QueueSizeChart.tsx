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
  type MouseHandlerDataParam,
} from "recharts";
import { useHistory } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import { queueDetailsPath } from "../paths";

interface Props {
  data: TaskBreakdown[];
}

interface TaskBreakdown {
  queue: string; // name of the queue.
  active: number; // number of active tasks in the queue.
  pending: number; // number of pending tasks in the queue.
  aggregating: number; // number of aggregating tasks in the queue.
  scheduled: number; // number of scheduled tasks in the queue.
  retry: number; // number of retry tasks in the queue.
  archived: number; // number of archived tasks in the queue.
  completed: number; // number of completed tasks in the queue.
}

function QueueSizeChart(props: Props) {
  const theme = useTheme();
  const handleClick = (params: MouseHandlerDataParam) => {
    const allQueues = props.data.map((b) => b.queue);
    if (
      typeof params.activeLabel === "string" &&
      allQueues.includes(params.activeLabel)
    ) {
      history.push(queueDetailsPath(params.activeLabel));
    }
  };
  const history = useHistory();
  return (
    <ResponsiveContainer>
      <BarChart
        data={props.data}
        maxBarSize={120}
        onClick={handleClick}
        style={{ cursor: "pointer" }}
      >
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
        <Legend
          height={72}
          iconSize={8}
          wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
        />
        <Bar
          isAnimationActive={false}
          dataKey="active"
          stackId="a"
          fill="#0d9488"
        />
        <Bar
          isAnimationActive={false}
          dataKey="pending"
          stackId="a"
          fill="#818cf8"
        />
        <Bar
          isAnimationActive={false}
          dataKey="aggregating"
          stackId="a"
          fill="#a78bfa"
        />
        <Bar
          isAnimationActive={false}
          dataKey="scheduled"
          stackId="a"
          fill="#fbbf24"
        />
        <Bar
          isAnimationActive={false}
          dataKey="retry"
          stackId="a"
          fill="#fb923c"
        />
        <Bar
          isAnimationActive={false}
          dataKey="archived"
          stackId="a"
          fill="#fb7185"
        />
        <Bar
          isAnimationActive={false}
          dataKey="completed"
          stackId="a"
          fill="#34d399"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default QueueSizeChart;
