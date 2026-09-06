import React from "react";
import { makeStyles } from "tss-react/mui";

import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { QueueLocation } from "../api";

const useStyles = makeStyles()((theme) => ({
  table: {
    minWidth: 650,
  },
}));

interface Props {
  queueLocations: QueueLocation[];
}

export default function QueueLocationTable(props: Props) {
  const { classes } = useStyles();

  return (
    <TableContainer>
      <Table className={classes.table} aria-label="queue location table">
        <TableHead>
          <TableRow>
            <TableCell>Queue</TableCell>
            <TableCell>KeySlot</TableCell>
            <TableCell>Node Addresses</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {props.queueLocations.map((loc) => (
            <TableRow key={loc.queue}>
              <TableCell component="th" scope="row">
                {loc.queue}
              </TableCell>
              <TableCell>{loc.keyslot}</TableCell>
              <TableCell>{loc.nodes.join(", ")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
