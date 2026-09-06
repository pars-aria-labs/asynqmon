import { useMemo } from "react";
import { createTheme, Theme, alpha } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { ThemePreference } from "./reducers/settingsReducer";

export function useTheme(preference: ThemePreference): Theme {
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const dark =
    preference === ThemePreference.Always ||
    (preference === ThemePreference.SystemDefault && systemDark);
  return useMemo(
    () =>
      createTheme({
        palette: {
          mode: dark ? "dark" : "light",
          primary: { main: dark ? "#5eead4" : "#0f766e" },
          secondary: { main: dark ? "#a5b4fc" : "#6366f1" },
          background: {
            default: dark ? "#0c121c" : "#f5f7fa",
            paper: dark ? "#141e2d" : "#ffffff",
          },
          text: {
            primary: dark ? "#e7edf5" : "#172b40",
            secondary: dark ? "#9aacc2" : "#64748b",
          },
          divider: dark ? "#263449" : "#e5eaf0",
          success: { main: dark ? "#4ade80" : "#15803d" },
          error: { main: dark ? "#fb7185" : "#be123c" },
          warning: { main: dark ? "#fbbf24" : "#a16207" },
        },
        shape: { borderRadius: 12 },
        typography: {
          fontFamily:
            '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
          fontSize: 13,
          h4: { fontWeight: 750, letterSpacing: "-0.04em" },
          h5: { fontWeight: 700, letterSpacing: "-0.03em" },
          h6: { fontSize: "1rem", fontWeight: 650, letterSpacing: "-0.015em" },
          button: { textTransform: "none", fontWeight: 600 },
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: { margin: 0 },
              "*": { boxSizing: "border-box" },
              "::selection": { background: alpha("#14b8a6", 0.25) },
              a: { color: "inherit" },
              "*:focus-visible": {
                outline: "2px solid #14b8a6",
                outlineOffset: 3,
              },
              "@media (prefers-reduced-motion: reduce)": {
                "*, *::before, *::after": {
                  animationDuration: "0.01ms !important",
                  transitionDuration: "0.01ms !important",
                },
              },
            },
          },
          MuiPaper: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
              root: { backgroundImage: "none" },
              outlined: { borderColor: dark ? "#263449" : "#e5eaf0" },
            },
          },
          MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: { root: { borderRadius: 8, padding: "7px 14px" } },
          },
          MuiTableCell: {
            styleOverrides: {
              root: {
                borderColor: dark ? "#263449" : "#edf0f4",
                padding: "15px 16px",
                fontVariantNumeric: "tabular-nums",
              },
              head: {
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.055em",
                color: dark ? "#9aacc2" : "#64748b",
                backgroundColor: dark ? "#182435" : "#f8fafc",
                whiteSpace: "nowrap",
              },
            },
          },
          MuiTableRow: {
            styleOverrides: {
              root: {
                "&:hover td": { backgroundColor: dark ? "#182435" : "#f8fafc" },
              },
            },
          },
          MuiChip: {
            styleOverrides: { root: { fontWeight: 600, borderRadius: 7 } },
          },
          MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 8 } } },
          MuiTab: {
            styleOverrides: {
              root: { textTransform: "none", fontWeight: 600, minWidth: 80 },
            },
          },
          MuiTooltip: {
            defaultProps: { arrow: true },
            styleOverrides: {
              tooltip: { padding: "8px 12px", fontSize: 12, borderRadius: 8 },
            },
          },
        },
      }),
    [dark],
  );
}

export function isDarkTheme(theme: Theme): boolean {
  return theme.palette.mode === "dark";
}
