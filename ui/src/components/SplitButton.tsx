import React from "react";
import { makeStyles } from "tss-react/mui";

import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Grow from "@mui/material/Grow";
import Paper from "@mui/material/Paper";
import Popper from "@mui/material/Popper";
import MenuItem from "@mui/material/MenuItem";
import MenuList from "@mui/material/MenuList";
import { isDarkTheme } from "../theme";

interface Option {
  label: string;
  key: string;
}

interface Props {
  options: Option[];
  initialSelectedKey: string;
  onSelect: (key: string) => void;
}

const useStyles = makeStyles()((theme) => ({
  popper: {
    zIndex: 2,
  },
  buttonContained: {
    backgroundColor: isDarkTheme(theme)
      ? "#303030"
      : theme.palette.background.default,
    color: theme.palette.text.primary,
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    },
  },
}));

export default function SplitButton(props: Props) {
  const { classes } = useStyles();
  const [open, setOpen] = React.useState<boolean>(false);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [selectedKey, setSelectedKey] = React.useState<string>(
    props.initialSelectedKey,
  );

  const handleMenuItemClick = (
    event: React.MouseEvent<HTMLLIElement, MouseEvent>,
    key: string,
  ) => {
    setSelectedKey(key);
    setOpen(false);
    props.onSelect(key);
  };

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event: MouseEvent | TouchEvent) => {
    if (
      anchorRef.current &&
      anchorRef.current.contains(event.target as HTMLElement)
    ) {
      return;
    }
    setOpen(false);
  };

  const selectedOpt = props.options.find((opt) => opt.key === selectedKey);

  return (
    <>
      <ButtonGroup
        variant="outlined"
        ref={anchorRef}
        aria-label="split button"
        size="small"
        disableElevation
      >
        <Button
          onClick={handleToggle}
          sx={{
            bgcolor: "background.paper",
            color: "text.primary",
            borderColor: "divider",
          }}
        >
          {selectedOpt ? selectedOpt.label : "Select Option"}
        </Button>
        <Button
          size="small"
          aria-controls={open ? "split-button-menu" : undefined}
          aria-expanded={open ? "true" : undefined}
          aria-label="select option"
          aria-haspopup="menu"
          onClick={handleToggle}
          sx={{
            bgcolor: "background.paper",
            color: "text.primary",
            borderColor: "divider",
          }}
        >
          <ArrowDropDownIcon />
        </Button>
      </ButtonGroup>
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
        className={classes.popper}
      >
        {({ TransitionProps, placement }) => (
          <Grow
            {...TransitionProps}
            style={{
              transformOrigin:
                placement === "bottom" ? "center top" : "center bottom",
            }}
          >
            <Paper>
              <ClickAwayListener onClickAway={handleClose}>
                <MenuList id="split-button-menu">
                  {props.options.map((opt) => (
                    <MenuItem
                      key={opt.key}
                      selected={opt.key === selectedKey}
                      onClick={(event) => handleMenuItemClick(event, opt.key)}
                    >
                      {opt.label}
                    </MenuItem>
                  ))}
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </>
  );
}
