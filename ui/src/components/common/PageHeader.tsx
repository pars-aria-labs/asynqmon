import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

export default function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: { xs: "flex-start", sm: "center" },
        justifyContent: "space-between",
        gap: 2,
        flexWrap: "wrap",
        mb: 3.5,
      }}
    >
      <Box>
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontSize: { xs: 26, md: 30 }, mb: 0.75 }}
        >
          {title}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          {description}
        </Typography>
      </Box>
      {actions}
    </Box>
  );
}
