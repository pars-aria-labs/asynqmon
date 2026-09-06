import React from "react";
import { makeStyles } from "tss-react/mui";
import { useTheme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import useMediaQuery from "@mui/material/useMediaQuery";
import ListSubheader from "@mui/material/ListSubheader";
import { VariableSizeList, ListChildComponentProps } from "react-window";
import { GroupInfo } from "../api";
import { isDarkTheme } from "../theme";

const useStyles = makeStyles()((theme) => ({
  groupSelectOption: {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
  },
  groupSize: {
    fontSize: "12px",
    color: theme.palette.text.secondary,
    background: isDarkTheme(theme)
      ? "#303030"
      : theme.palette.background.default,
    textAlign: "center",
    padding: "3px 6px",
    borderRadius: "10px",
    marginRight: "2px",
  },
  inputRoot: {
    borderRadius: 20,
    paddingLeft: "12px !important",
  },
}));

interface Props {
  selected: GroupInfo | null;
  onSelect: (newVal: GroupInfo | null) => void;
  groups: GroupInfo[];
  error: string;
}

export default function GroupSelect(props: Props) {
  const { classes } = useStyles();
  const [inputValue, setInputValue] = React.useState("");

  return (
    <Autocomplete
      id="task-group-selector"
      value={props.selected}
      onChange={(event: any, newValue: GroupInfo | null) => {
        props.onSelect(newValue);
      }}
      inputValue={inputValue}
      onInputChange={(event, newInputValue) => {
        setInputValue(newInputValue);
      }}
      disableListWrap
      ListboxComponent={
        ListboxComponent as React.ComponentType<
          React.HTMLAttributes<HTMLElement>
        >
      }
      options={props.groups}
      getOptionLabel={(option: GroupInfo) => option.group}
      style={{ width: 300 }}
      isOptionEqualToValue={(option, value) => option.group === value.group}
      renderOption={(optionProps, option: GroupInfo) => (
        <li {...optionProps} className={classes.groupSelectOption}>
          <span>{option.group}</span>
          <span className={classes.groupSize}>{option.size}</span>
        </li>
      )}
      renderInput={(params) => (
        <TextField {...params} label="Select group" variant="outlined" />
      )}
      classes={{
        inputRoot: classes.inputRoot,
      }}
      size="small"
    />
  );
}

// Virtualized list.
// Reference: https://v4.mui.com/components/autocomplete/#virtualization

const LISTBOX_PADDING = 8; // px

function renderRow(props: ListChildComponentProps) {
  const { data, index, style } = props;
  return React.cloneElement(data[index], {
    style: {
      ...style,
      top: (style.top as number) + LISTBOX_PADDING,
    },
  });
}

const OuterElementContext = React.createContext({});

const OuterElementType = React.forwardRef<HTMLDivElement>((props, ref) => {
  const outerProps = React.useContext(OuterElementContext);
  return <div ref={ref} {...props} {...outerProps} />;
});

function useResetCache(data: any) {
  const ref = React.useRef<VariableSizeList>(null);
  React.useEffect(() => {
    if (ref.current != null) {
      ref.current.resetAfterIndex(0, true);
    }
  }, [data]);
  return ref;
}

// Adapter for react-window
const ListboxComponent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLElement>
>(function ListboxComponent(props, ref) {
  const { children, ...other } = props;
  const itemData = React.Children.toArray(children);
  const theme = useTheme();
  const smUp = useMediaQuery(theme.breakpoints.up("sm"), { noSsr: true });
  const itemCount = itemData.length;
  const itemSize = smUp ? 36 : 48;

  const getChildSize = (child: React.ReactNode) => {
    if (React.isValidElement(child) && child.type === ListSubheader) {
      return 48;
    }
    return itemSize;
  };

  const getHeight = () => {
    if (itemCount > 8) {
      return 8 * itemSize;
    }
    return itemData.map(getChildSize).reduce((a, b) => a + b, 0);
  };

  const gridRef = useResetCache(itemCount);

  return (
    <div ref={ref}>
      <OuterElementContext.Provider value={other}>
        <VariableSizeList
          itemData={itemData}
          height={getHeight() + 2 * LISTBOX_PADDING}
          width="100%"
          ref={gridRef}
          outerElementType={OuterElementType}
          innerElementType="ul"
          itemSize={(index) => getChildSize(itemData[index])}
          overscanCount={5}
          itemCount={itemCount}
        >
          {renderRow}
        </VariableSizeList>
      </OuterElementContext.Provider>
    </div>
  );
});
