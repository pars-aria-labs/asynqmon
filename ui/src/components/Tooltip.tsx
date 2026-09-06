import { withStyles } from "tss-react/mui";
import { Theme } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";

// Export custom style tooltip.
export default withStyles(Tooltip, (theme: Theme) => ({
  tooltip: {
    backgroundColor: "#f5f5f9",
    color: "rgba(0, 0, 0, 0.87)",
    maxWidth: 400,
    fontSize: theme.typography.pxToRem(12),
    border: "1px solid #dadde9",
  },
}));
