import { ReactNode } from "react";
import { alpha } from "@mui/material/styles";
import { Box, Paper, Skeleton, Stack, Typography } from "@mui/material";

export default function StatCard({
  label,
  value,
  detail,
  icon,
  color,
  loading,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  color: string;
  loading: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, height: "100%" }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          fontWeight={500}
          sx={{ fontSize: { xs: 11, sm: 13 } }}
        >
          {label}
        </Typography>
        <Box
          sx={{
            width: 32,
            height: 32,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            borderRadius: 2,
            bgcolor: alpha(color, 0.1),
            color,
          }}
        >
          {icon}
        </Box>
      </Stack>
      <Typography
        variant="h4"
        sx={{
          mt: 1,
          mb: 0.75,
          fontSize: { xs: 26, sm: 30 },
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {loading ? <Skeleton width={80} /> : value.toLocaleString()}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {detail}
      </Typography>
    </Paper>
  );
}
