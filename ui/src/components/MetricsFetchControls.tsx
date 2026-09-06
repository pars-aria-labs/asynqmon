import React from "react";
import { makeStyles } from "tss-react/mui";
import Button, { ButtonProps } from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowLeftIcon from "@mui/icons-material/ArrowLeft";
import ArrowRightIcon from "@mui/icons-material/ArrowRight";
import FilterListIcon from "@mui/icons-material/FilterList";
import dayjs from "dayjs";
import { currentUnixtime, parseDuration } from "../utils";
import { isDarkTheme } from "../theme";
import { MAX_METRICS_DURATION_SECONDS } from "../metricsLimits";

interface Props {
  // Specifies the endtime in Unix time seconds.
  endTimeSec: number;
  // Whether endTimeSec came from a fixed URL value. A timestamp close to now
  // is ambiguous on its own (it can also mean "Freeze at now").
  isEndTimeFixed: boolean;
  onEndTimeChange: (t: number, isEndTimeFixed: boolean) => void;

  // Specifies the duration in seconds.
  durationSec: number;
  onDurationChange: (d: number, isEndTimeFixed: boolean) => void;

  // All available queues.
  queues: string[];
  // Selected queues.
  selectedQueues: string[];
  addQueue: (qname: string) => void;
  removeQueue: (qname: string) => void;
}

interface State {
  endTimeOption: EndTimeOption;
  durationOption: DurationOption;
  customEndTime: string; // text shown in input field
  customDuration: string; // text shown in input field
  customEndTimeError: string;
  customDurationError: string;
}

type EndTimeOption = "real_time" | "freeze_at_now" | "custom";
type DurationOption = "1h" | "6h" | "1d" | "8d" | "30d" | "custom";

const useStyles = makeStyles()((theme) => ({
  root: {
    display: "flex",
    alignItems: "center",
  },
  endTimeCaption: {
    marginRight: theme.spacing(1),
  },
  shiftButtons: {
    marginLeft: theme.spacing(1),
  },
  buttonGroupRoot: {
    height: 29,
    position: "relative",
    top: 1,
  },
  endTimeShiftControls: {
    padding: theme.spacing(1),
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderBottomColor: theme.palette.divider,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
  },
  leftShiftButtons: {
    display: "flex",
    alignItems: "center",
    marginRight: theme.spacing(2),
  },
  rightShiftButtons: {
    display: "flex",
    alignItems: "center",
    marginLeft: theme.spacing(2),
  },
  controlsContainer: {
    display: "flex",
    justifyContent: "flex-end",
  },
  controlSelectorBox: {
    display: "flex",
    minWidth: 490,
    padding: theme.spacing(2),
  },
  controlEndTimeSelector: {
    width: "50%",
  },
  controlDurationSelector: {
    width: "50%",
  },
  radioButtonRoot: {
    paddingTop: theme.spacing(0.5),
    paddingBottom: theme.spacing(0.5),
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
  },
  formControlLabel: {
    fontSize: 14,
  },
  buttonLabel: {
    textTransform: "none",
    fontSize: 12,
  },
  formControlRoot: {
    width: "100%",
    margin: 0,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: 500,
    marginBottom: theme.spacing(1),
  },
  customInputField: {
    marginTop: theme.spacing(1),
  },
  filterButton: {
    marginLeft: theme.spacing(1),
  },
  queueFilters: {
    padding: theme.spacing(2),
    maxHeight: 400,
  },
  checkbox: {
    padding: 6,
  },
}));

// minute, hour, day in seconds
const minute = 60;
const hour = 60 * minute;
const day = 24 * hour;

function getInitialState(
  endTimeSec: number,
  durationSec: number,
  isEndTimeFixed: boolean,
): State {
  const endTimeOption: EndTimeOption = isEndTimeFixed
    ? "custom"
    : "real_time";
  const customEndTime = isEndTimeFixed
    ? new Date(endTimeSec * 1000).toISOString()
    : "";
  let durationOption: DurationOption = "1h";
  let customDuration = "";

  switch (durationSec) {
    case 1 * hour:
      durationOption = "1h";
      break;
    case 6 * hour:
      durationOption = "6h";
      break;
    case 1 * day:
      durationOption = "1d";
      break;
    case 8 * day:
      durationOption = "8d";
      break;
    case 30 * day:
      durationOption = "30d";
      break;
    default:
      durationOption = "custom";
      customDuration = durationSec + "s";
  }

  return {
    endTimeOption,
    customEndTime,
    customEndTimeError: "",
    durationOption,
    customDuration,
    customDurationError: "",
  };
}

export function MetricsFetchControls(props: Props) {
  const { classes } = useStyles();

  const [state, setState] = React.useState<State>(
    getInitialState(
      props.endTimeSec,
      props.durationSec,
      props.isEndTimeFixed,
    ),
  );
  const [timePopoverAnchorElem, setTimePopoverAnchorElem] =
    React.useState<HTMLButtonElement | null>(null);

  const [queuePopoverAnchorElem, setQueuePopoverAnchorElem] =
    React.useState<HTMLButtonElement | null>(null);
  const pendingFreezeTime = React.useRef<number | null>(null);
  const previousEndTimeFixed = React.useRef(props.isEndTimeFixed);

  // URL navigation changes these props without remounting the controls. Keep
  // fixed timestamps in sync, but do not treat each realtime display tick as a
  // mode transition: the user may be editing a custom end time before submit.
  React.useEffect(() => {
    const wasFixed = previousEndTimeFixed.current;
    previousEndTimeFixed.current = props.isEndTimeFixed;
    setState((previous) => {
      if (!props.isEndTimeFixed) {
        if (!wasFixed) return previous;
        return {
          ...previous,
          endTimeOption: "real_time",
          customEndTime: "",
          customEndTimeError: "",
        };
      }
      if (
        previous.endTimeOption === "freeze_at_now" &&
        pendingFreezeTime.current === props.endTimeSec
      ) {
        return previous;
      }
      return {
        ...previous,
        endTimeOption: "custom",
        customEndTime: new Date(props.endTimeSec * 1000).toISOString(),
        customEndTimeError: "",
      };
    });
  }, [props.endTimeSec, props.isEndTimeFixed]);

  React.useEffect(() => {
    const next = getInitialState(
      0,
      props.durationSec,
      false,
    );
    setState((previous) => ({
      ...previous,
      durationOption: next.durationOption,
      customDuration: next.customDuration,
      customDurationError: "",
    }));
  }, [props.durationSec]);

  const handleEndTimeOptionChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedOpt = (event.target as HTMLInputElement)
      .value as EndTimeOption;
    setState((prevState) => ({
      ...prevState,
      endTimeOption: selectedOpt,
      customEndTime: "",
      customEndTimeError: "",
    }));
    switch (selectedOpt) {
      case "real_time":
        pendingFreezeTime.current = null;
        props.onEndTimeChange(currentUnixtime(), /*isEndTimeFixed=*/ false);
        break;
      case "freeze_at_now": {
        const now = currentUnixtime();
        pendingFreezeTime.current = now;
        props.onEndTimeChange(now, /*isEndTimeFixed=*/ true);
        break;
      }
      case "custom":
        pendingFreezeTime.current = null;
      // No-op
    }
  };

  const handleDurationOptionChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedOpt = (event.target as HTMLInputElement)
      .value as DurationOption;
    setState((prevState) => ({
      ...prevState,
      durationOption: selectedOpt,
      customDuration: "",
      customDurationError: "",
    }));
    const isEndTimeFixed = state.endTimeOption !== "real_time";
    switch (selectedOpt) {
      case "1h":
        props.onDurationChange(1 * hour, isEndTimeFixed);
        break;
      case "6h":
        props.onDurationChange(6 * hour, isEndTimeFixed);
        break;
      case "1d":
        props.onDurationChange(1 * day, isEndTimeFixed);
        break;
      case "8d":
        props.onDurationChange(8 * day, isEndTimeFixed);
        break;
      case "30d":
        props.onDurationChange(30 * day, isEndTimeFixed);
        break;
      case "custom":
      // No-op
    }
  };

  const handleCustomDurationChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    event.persist(); // https://reactjs.org/docs/legacy-event-pooling.html
    setState((prevState) => ({
      ...prevState,
      customDuration: event.target.value,
    }));
  };

  const handleCustomEndTimeChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    event.persist(); // https://reactjs.org/docs/legacy-event-pooling.html
    setState((prevState) => ({
      ...prevState,
      customEndTime: event.target.value,
    }));
  };

  const handleCustomDurationKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      try {
        const d = parseDuration(state.customDuration);
        if (d > MAX_METRICS_DURATION_SECONDS) {
          throw new Error("duration exceeds the supported range");
        }
        setState((prevState) => ({
          ...prevState,
          durationOption: "custom",
          customDurationError: "",
        }));
        props.onDurationChange(d, state.endTimeOption !== "real_time");
      } catch (error) {
        setState((prevState) => ({
          ...prevState,
          customDurationError: "Use a duration from 1s to 30d",
        }));
      }
    }
  };

  const handleCustomEndTimeKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      const timeUsecOrNaN = Date.parse(state.customEndTime);
      if (isNaN(timeUsecOrNaN)) {
        setState((prevState) => ({
          ...prevState,
          customEndTimeError: "End time invalid",
        }));
        return;
      }
      setState((prevState) => ({
        ...prevState,
        endTimeOption: "custom",
        customEndTimeError: "",
      }));
      props.onEndTimeChange(
        Math.floor(timeUsecOrNaN / 1000),
        /* isEndTimeFixed= */ true,
      );
    }
  };

  const handleOpenTimePopover = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    setTimePopoverAnchorElem(event.currentTarget);
  };

  const handleCloseTimePopover = () => {
    setTimePopoverAnchorElem(null);
  };

  const handleOpenQueuePopover = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    setQueuePopoverAnchorElem(event.currentTarget);
  };

  const handleCloseQueuePopover = () => {
    setQueuePopoverAnchorElem(null);
  };

  const isTimePopoverOpen = Boolean(timePopoverAnchorElem);
  const isQueuePopoverOpen = Boolean(queuePopoverAnchorElem);

  const shiftBy = (deltaSec: number) => {
    return () => {
      const now = currentUnixtime();
      const endTime = props.endTimeSec + deltaSec;
      if (now <= endTime) {
        setState((prevState) => ({
          ...prevState,
          customEndTime: "",
          endTimeOption: "real_time",
        }));
        props.onEndTimeChange(now, /*isEndTimeFixed=*/ false);
        return;
      }
      setState((prevState) => ({
        ...prevState,
        endTimeOption: "custom",
        customEndTime: new Date(endTime * 1000).toISOString(),
      }));
      props.onEndTimeChange(endTime, /*isEndTimeFixed=*/ true);
    };
  };

  return (
    <div className={classes.root}>
      <Typography
        variant="caption"
        color="textPrimary"
        className={classes.endTimeCaption}
      >
        {formatTime(props.endTimeSec)}
      </Typography>
      <div>
        <Button
          aria-describedby={isTimePopoverOpen ? "time-popover" : undefined}
          variant="outlined"
          color="primary"
          onClick={handleOpenTimePopover}
          size="small"
          classes={{
            root: classes.buttonLabel,
          }}
        >
          {state.endTimeOption === "real_time" ? "Realtime" : "Historical"}:{" "}
          {state.durationOption === "custom"
            ? state.customDuration
            : state.durationOption}
        </Button>
        <Popover
          id={isTimePopoverOpen ? "time-popover" : undefined}
          open={isTimePopoverOpen}
          anchorEl={timePopoverAnchorElem}
          onClose={handleCloseTimePopover}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "center",
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "center",
          }}
        >
          <div className={classes.endTimeShiftControls}>
            <div className={classes.leftShiftButtons}>
              <ShiftButton
                direction="left"
                text="2h"
                onClick={shiftBy(-2 * hour)}
                dense={true}
              />
              <ShiftButton
                direction="left"
                text="1h"
                onClick={shiftBy(-1 * hour)}
                dense={true}
              />
              <ShiftButton
                direction="left"
                text="30m"
                onClick={shiftBy(-30 * minute)}
                dense={true}
              />
              <ShiftButton
                direction="left"
                text="15m"
                onClick={shiftBy(-15 * minute)}
                dense={true}
              />
              <ShiftButton
                direction="left"
                text="5m"
                onClick={shiftBy(-5 * minute)}
                dense={true}
              />
            </div>
            <div className={classes.rightShiftButtons}>
              <ShiftButton
                direction="right"
                text="5m"
                onClick={shiftBy(5 * minute)}
                dense={true}
              />
              <ShiftButton
                direction="right"
                text="15m"
                onClick={shiftBy(15 * minute)}
                dense={true}
              />
              <ShiftButton
                direction="right"
                text="30m"
                onClick={shiftBy(30 * minute)}
                dense={true}
              />
              <ShiftButton
                direction="right"
                text="1h"
                onClick={shiftBy(1 * hour)}
                dense={true}
              />
              <ShiftButton
                direction="right"
                text="2h"
                onClick={shiftBy(2 * hour)}
                dense={true}
              />
            </div>
          </div>
          <div className={classes.controlSelectorBox}>
            <div className={classes.controlEndTimeSelector}>
              <FormControl
                component="fieldset"
                margin="dense"
                classes={{ root: classes.formControlRoot }}
              >
                <FormLabel className={classes.formLabel} component="legend">
                  End Time
                </FormLabel>
                <RadioGroup
                  aria-label="end_time"
                  name="end_time"
                  value={state.endTimeOption}
                  onChange={handleEndTimeOptionChange}
                >
                  <RadioInput value="real_time" label="Real Time" />
                  <RadioInput value="freeze_at_now" label="Freeze at now" />
                  <RadioInput value="custom" label="Custom End Time" />
                </RadioGroup>
                <div className={classes.customInputField}>
                  <TextField
                    id="custom-endtime"
                    label="yyyy-mm-dd hh:mm:ssz"
                    variant="outlined"
                    size="small"
                    onChange={handleCustomEndTimeChange}
                    value={state.customEndTime}
                    onKeyDown={handleCustomEndTimeKeyDown}
                    error={state.customEndTimeError !== ""}
                    helperText={state.customEndTimeError}
                  />
                </div>
              </FormControl>
            </div>
            <div className={classes.controlDurationSelector}>
              <FormControl
                component="fieldset"
                margin="dense"
                classes={{ root: classes.formControlRoot }}
              >
                <FormLabel className={classes.formLabel} component="legend">
                  Duration
                </FormLabel>
                <RadioGroup
                  aria-label="duration"
                  name="duration"
                  value={state.durationOption}
                  onChange={handleDurationOptionChange}
                >
                  <RadioInput value="1h" label="1h" />
                  <RadioInput value="6h" label="6h" />
                  <RadioInput value="1d" label="1 day" />
                  <RadioInput value="8d" label="8 days" />
                  <RadioInput value="30d" label="30 days" />
                  <RadioInput value="custom" label="Custom Duration" />
                </RadioGroup>
                <div className={classes.customInputField}>
                  <TextField
                    id="custom-duration"
                    label="duration"
                    variant="outlined"
                    size="small"
                    onChange={handleCustomDurationChange}
                    value={state.customDuration}
                    onKeyDown={handleCustomDurationKeyDown}
                    error={state.customDurationError !== ""}
                    helperText={state.customDurationError}
                  />
                </div>
              </FormControl>
            </div>
          </div>
        </Popover>
      </div>
      <div className={classes.shiftButtons}>
        <ButtonGroup
          classes={{ root: classes.buttonGroupRoot }}
          size="small"
          color="primary"
          aria-label="shift buttons"
        >
          <ShiftButton
            direction="left"
            text={
              state.durationOption === "custom" ? "1h" : state.durationOption
            }
            color="primary"
            onClick={
              state.durationOption === "custom"
                ? shiftBy(-1 * hour)
                : shiftBy(-props.durationSec)
            }
          />
          <ShiftButton
            direction="right"
            text={
              state.durationOption === "custom" ? "1h" : state.durationOption
            }
            color="primary"
            onClick={
              state.durationOption === "custom"
                ? shiftBy(1 * hour)
                : shiftBy(props.durationSec)
            }
          />
        </ButtonGroup>
      </div>
      <div className={classes.filterButton}>
        <IconButton
          aria-label="filter"
          size="small"
          onClick={handleOpenQueuePopover}
        >
          <FilterListIcon />
        </IconButton>
        <Popover
          id={isQueuePopoverOpen ? "queue-popover" : undefined}
          open={isQueuePopoverOpen}
          anchorEl={queuePopoverAnchorElem}
          onClose={handleCloseQueuePopover}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "center",
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "center",
          }}
        >
          <FormControl className={classes.queueFilters}>
            <FormLabel className={classes.formLabel} component="legend">
              Queues
            </FormLabel>
            <FormGroup>
              {props.queues.map((qname) => (
                <FormControlLabel
                  key={qname}
                  control={
                    <Checkbox
                      size="small"
                      checked={props.selectedQueues.includes(qname)}
                      onChange={() => {
                        if (props.selectedQueues.includes(qname)) {
                          props.removeQueue(qname);
                        } else {
                          props.addQueue(qname);
                        }
                      }}
                      name={qname}
                      className={classes.checkbox}
                    />
                  }
                  label={qname}
                  classes={{ label: classes.formControlLabel }}
                />
              ))}
            </FormGroup>
          </FormControl>
        </Popover>
      </div>
    </div>
  );
}

/****************** Helper functions/components *******************/

function formatTime(unixtime: number): string {
  const tz = new Date(unixtime * 1000)
    .toLocaleTimeString("en-us", { timeZoneName: "short" })
    .split(" ")[2];
  return dayjs.unix(unixtime).format("ddd, DD MMM YYYY HH:mm:ss ") + tz;
}

interface RadioInputProps {
  value: string;
  label: string;
}

function RadioInput(props: RadioInputProps) {
  const { classes } = useStyles();
  return (
    <FormControlLabel
      classes={{ label: classes.formControlLabel }}
      value={props.value}
      control={
        <Radio size="small" classes={{ root: classes.radioButtonRoot }} />
      }
      label={props.label}
    />
  );
}

interface ShiftButtonProps extends ButtonProps {
  text: string;
  onClick: () => void;
  direction: "left" | "right";
  dense?: boolean;
}

const useShiftButtonStyles = makeStyles<ShiftButtonProps>()((theme, props) => ({
  root: {
    minWidth: 40,
    fontWeight: props.dense ? 400 : 500,
  },
  label: { fontSize: 12, textTransform: "none" },
  iconRoot: {
    marginRight: props.direction === "left" ? (props.dense ? -8 : -4) : 0,
    marginLeft: props.direction === "right" ? (props.dense ? -8 : -4) : 0,
    color: props.color
      ? props.color
      : theme.palette.grey[isDarkTheme(theme) ? 200 : 700],
  },
}));

function ShiftButton(inputProps: ShiftButtonProps) {
  const props = { dense: false, ...inputProps };
  const { classes } = useShiftButtonStyles(props);
  const { text, direction, dense, ...buttonProps } = props;
  return (
    <Button
      {...buttonProps}
      classes={{
        root: `${classes.root} ${classes.label}`,
      }}
      size="small"
    >
      {direction === "left" && (
        <ArrowLeftIcon classes={{ root: classes.iconRoot }} />
      )}
      {text}
      {direction === "right" && (
        <ArrowRightIcon classes={{ root: classes.iconRoot }} />
      )}
    </Button>
  );
}

export default MetricsFetchControls;
