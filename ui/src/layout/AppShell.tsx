import DataFreshness from "../components/common/DataFreshness";
import { ReactNode, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation } from "react-router-dom";
import {
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  BarChartRounded,
  ChevronLeftRounded,
  DarkModeOutlined,
  DnsOutlined,
  HelpOutlineRounded,
  LayersOutlined,
  LightModeOutlined,
  MenuRounded,
  ScheduleRounded,
  SettingsOutlined,
  TimelineRounded,
} from "@mui/icons-material";
import { AppState } from "../store";
import { paths as getPaths } from "../paths";
import { selectTheme, toggleDrawer } from "../actions/settingsActions";
import { ThemePreference } from "../reducers/settingsReducer";
import logo from "../images/logo-color.svg";
import darkLogo from "../images/logo-white.svg";

export default function AppShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const dark = theme.palette.mode === "dark";
  const dispatch = useDispatch();
  const expanded = useSelector(
    (state: AppState) => state.settings.isDrawerOpen,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const paths = getPaths();
  const width = expanded ? 236 : 76;
  const showLabels = mobile || expanded;
  const items = [
    {
      title: "Queues",
      to: paths.HOME,
      icon: <BarChartRounded />,
      active:
        location.pathname === paths.HOME ||
        location.pathname.startsWith(`${window.ROOT_PATH}/queues/`),
    },
    { title: "Servers", to: paths.SERVERS, icon: <DnsOutlined /> },
    { title: "Schedulers", to: paths.SCHEDULERS, icon: <ScheduleRounded /> },
    { title: "Redis", to: paths.REDIS, icon: <LayersOutlined /> },
    {
      title: "Metrics",
      to: paths.QUEUE_METRICS,
      icon: <TimelineRounded />,
    },
  ];
  const navItem = (item: {
    title: string;
    to: string;
    icon: ReactNode;
    active?: boolean;
  }) => {
    const active = item.active ?? location.pathname === item.to;
    return (
      <Tooltip
        key={item.title}
        title={showLabels ? "" : item.title}
        placement="right"
      >
        <ListItemButton
          component={Link}
          to={item.to}
          selected={active}
          aria-current={active ? "page" : undefined}
          aria-label={item.title}
          onClick={() => setMobileOpen(false)}
          sx={{
            borderRadius: 2,
            mb: 0.5,
            minHeight: 46,
            px: 1.75,
            color: active ? "primary.main" : "text.secondary",
            "&.Mui-selected": {
              bgcolor: dark ? "rgba(94,234,212,.09)" : "rgba(15,118,110,.08)",
            },
          }}
        >
          <ListItemIcon
            sx={{ minWidth: showLabels ? 38 : 0, color: "inherit" }}
          >
            {item.icon}
          </ListItemIcon>
          {showLabels && (
            <ListItemText
              primary={item.title}
              primaryTypographyProps={{
                fontWeight: active ? 700 : 500,
                fontSize: 13,
              }}
            />
          )}
        </ListItemButton>
      </Tooltip>
    );
  };
  const navigation = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          height: 80,
          display: "flex",
          alignItems: "center",
          px: showLabels ? 3 : 2.5,
          flexShrink: 0,
        }}
      >
        <Link
          to={paths.HOME}
          onClick={() => setMobileOpen(false)}
          aria-label="Asynqmon home"
          style={{ display: "flex" }}
        >
          {showLabels ? (
            <img
              src={dark ? darkLogo : logo}
              alt="Asynqmon"
              width={156}
              height={40}
            />
          ) : (
            <LayersOutlined sx={{ color: "primary.main", fontSize: 30 }} />
          )}
        </Link>
      </Box>
      <Box
        component="nav"
        aria-label="Main navigation"
        sx={{ px: 1.5, flex: 1 }}
      >
        {showLabels && (
          <Typography
            variant="overline"
            sx={{
              px: 1.75,
              color: "text.secondary",
              fontSize: 10,
              letterSpacing: ".12em",
              lineHeight: 4,
            }}
          >
            WORKSPACE
          </Typography>
        )}
        <List disablePadding>{items.map(navItem)}</List>
      </Box>
      <Box sx={{ p: 1.5 }}>
        {navItem({
          title: "Settings",
          to: paths.SETTINGS,
          icon: <SettingsOutlined />,
        })}
        <Tooltip title={showLabels ? "" : "Help & feedback"} placement="right">
          <ListItemButton
            component="a"
            href="https://github.com/pars-aria-labs/asynqmon/issues"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Help & feedback"
            sx={{ borderRadius: 2, color: "text.secondary", px: 1.75 }}
          >
            <ListItemIcon
              sx={{ minWidth: showLabels ? 38 : 0, color: "inherit" }}
            >
              <HelpOutlineRounded />
            </ListItemIcon>
            {showLabels && (
              <ListItemText
                primary="Help & feedback"
                primaryTypographyProps={{ fontSize: 13 }}
              />
            )}
          </ListItemButton>
        </Tooltip>
        {showLabels && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ px: 1.75, pb: 1 }}>
              <Typography variant="caption" fontWeight={600}>
                Asynqmon
              </Typography>
              <Typography
                display="block"
                variant="caption"
                color="text.secondary"
              >
                Background work, in focus.
              </Typography>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
  return (
    <Box sx={{ display: "flex", minHeight: "100dvh" }}>
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: "fixed",
          top: -80,
          left: 16,
          zIndex: 1500,
          bgcolor: "background.paper",
          p: 2,
          "&:focus": { top: 8 },
        }}
      >
        Skip to content
      </Box>
      <Drawer
        variant={mobile ? "temporary" : "permanent"}
        open={mobile ? mobileOpen : true}
        onClose={() => setMobileOpen(false)}
        sx={{
          width: mobile ? 0 : width,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: mobile ? 260 : width,
            boxSizing: "border-box",
            borderRight: "1px solid",
            borderColor: "divider",
          },
        }}
      >
        {navigation}
      </Drawer>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Toolbar
          component="header"
          sx={{
            minHeight: "72px !important",
            bgcolor: "background.paper",
            borderBottom: "1px solid",
            borderColor: "divider",
            gap: 1,
            position: "sticky",
            top: 0,
            zIndex: 1100,
          }}
        >
          <IconButton
            aria-label={
              mobile
                ? "Open navigation"
                : expanded
                  ? "Collapse navigation"
                  : "Expand navigation"
            }
            onClick={() =>
              mobile ? setMobileOpen(true) : dispatch(toggleDrawer())
            }
            size="small"
          >
            {!mobile && expanded ? <ChevronLeftRounded /> : <MenuRounded />}
          </IconButton>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ display: { xs: "none", sm: "block" } }}
          >
            Workspace
          </Typography>
          <Typography
            color="text.disabled"
            sx={{ display: { xs: "none", sm: "block" }, mx: 0.75 }}
          >
            /
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {location.pathname === paths.SETTINGS
              ? "Settings"
              : items.find((i) => i.active ?? location.pathname === i.to)
                  ?.title || "Overview"}
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ ml: "auto" }}
          >
            <DataFreshness />
          {window.READ_ONLY && (
              <Chip size="small" label="Read only" variant="outlined" />
            )}
            <Tooltip
              title={dark ? "Switch to light theme" : "Switch to dark theme"}
            >
              <IconButton
                aria-label={
                  dark ? "Switch to light theme" : "Switch to dark theme"
                }
                onClick={() =>
                  dispatch(
                    selectTheme(
                      dark ? ThemePreference.Never : ThemePreference.Always,
                    ),
                  )
                }
              >
                {dark ? (
                  <LightModeOutlined fontSize="small" />
                ) : (
                  <DarkModeOutlined fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
        <Box
          component="main"
          id="main-content"
          tabIndex={-1}
          sx={{ minWidth: 0, pb: 3 }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
