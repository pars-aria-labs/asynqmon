import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Box,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Typography,
} from "@mui/material";
import { pollIntervalChange, selectTheme } from "../actions/settingsActions";
import { AppState } from "../store";
import { ThemePreference } from "../reducers/settingsReducer";
import PageHeader from "../components/common/PageHeader";

export default function SettingsView() {
  const { pollInterval, themePreference } = useSelector(
    (state: AppState) => state.settings,
  );
  const dispatch = useDispatch();
  const [interval, setInterval] = useState(pollInterval);
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <PageHeader
        title="Settings"
        description="Make this workspace work for you. Preferences are saved in this browser."
      />
      <Stack spacing={3} sx={{ maxWidth: 760 }}>
        <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3.5 } }}>
          <Typography variant="h6" id="polling-label">
            Data refresh
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
            Choose how often Asynqmon requests updated monitoring data.
          </Typography>
          <Box sx={{ mt: 3, px: 1 }}>
            <Slider
              aria-labelledby="polling-label"
              value={interval}
              min={2}
              max={20}
              step={1}
              valueLabelDisplay="auto"
              marks={[
                { value: 2, label: "2 seconds" },
                { value: 20, label: "20 seconds" },
              ]}
              onChange={(_, value) => setInterval(value as number)}
              onChangeCommitted={(_, value) =>
                dispatch(pollIntervalChange(value as number))
              }
            />
          </Box>
          <Typography variant="body2" color="primary" sx={{ mt: 2 }}>
            Refresh every {interval} seconds
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3.5 } }}>
          <Typography variant="h6">Appearance</Typography>
          <Typography
            color="text.secondary"
            variant="body2"
            sx={{ mt: 1, mb: 3 }}
          >
            Choose a theme or follow your device’s appearance.
          </Typography>
          <FormControl fullWidth sx={{ maxWidth: 300 }} size="small">
            <InputLabel id="theme-label">Color theme</InputLabel>
            <Select
              labelId="theme-label"
              label="Color theme"
              value={themePreference}
              onChange={(event) =>
                dispatch(
                  selectTheme(Number(event.target.value) as ThemePreference),
                )
              }
            >
              <MenuItem value={ThemePreference.SystemDefault}>
                System default
              </MenuItem>
              <MenuItem value={ThemePreference.Never}>Light</MenuItem>
              <MenuItem value={ThemePreference.Always}>Dark</MenuItem>
            </Select>
          </FormControl>
        </Paper>
      </Stack>
    </Container>
  );
}
