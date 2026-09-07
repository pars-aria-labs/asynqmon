import { useDispatch, useSelector } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import {
  CssBaseline,
  IconButton,
  Snackbar,
  ThemeProvider,
} from "@mui/material";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { AppState } from "./store";
import { useTheme } from "./theme";
import { closeSnackbar } from "./actions/snackbarActions";
import AppShell from "./layout/AppShell";
import AppRoutes from "./layout/AppRoutes";
import BulkActionProgress from "./components/BulkActionProgress";

export default function App() {
  const preference = useSelector(
    (state: AppState) => state.settings.themePreference,
  );
  const snackbar = useSelector((state: AppState) => state.snackbar);
  const dispatch = useDispatch();
  const theme = useTheme(preference);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AppShell>
          <AppRoutes />
        </AppShell>
      </BrowserRouter>
      <BulkActionProgress />
      <Snackbar
        open={snackbar.isOpen}
        autoHideDuration={6000}
        message={snackbar.message}
        onClose={(_, reason) => {
          if (reason !== "clickaway") dispatch(closeSnackbar());
        }}
        action={
          <IconButton
            size="small"
            color="inherit"
            aria-label="Dismiss notification"
            onClick={() => dispatch(closeSnackbar())}
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        }
      />
    </ThemeProvider>
  );
}
