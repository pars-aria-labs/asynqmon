import React from "react";
import Container from "@mui/material/Container";
import { makeStyles } from "tss-react/mui";

import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";

const useStyles = makeStyles()((theme) => ({
  container: {
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(4),
  },
  headingText: {
    fontWeight: "bold",
  },
}));

export default function PageNotFoundView() {
  const { classes } = useStyles();
  return (
    <Container maxWidth="lg" className={classes.container}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12 }}>
          <Typography
            variant="h5"
            align="center"
            className={classes.headingText}
          >
            Oops!
          </Typography>
          <Typography variant="subtitle1" color="textSecondary" align="center">
            404 - Page Not Found
          </Typography>
        </Grid>
      </Grid>
    </Container>
  );
}
