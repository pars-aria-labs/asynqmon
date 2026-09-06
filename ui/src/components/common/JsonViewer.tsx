import { useMemo, useState } from "react";
import { Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import SyntaxHighlighter from "../SyntaxHighlighter";
import { prettifyPayload } from "../../utils";
import CopyButton from "./CopyButton";

export default function JsonViewer({ title, value }: { title: string; value: string }) {
  const [query, setQuery] = useState("");
  const [raw, setRaw] = useState(false);
  const text = useMemo(() => raw ? value : prettifyPayload(value), [value, raw]);
  const lines = text.split("\n");
  const matching = lines.map((text, index) => ({ text, index })).filter(line => line.text.toLowerCase().includes(query.toLowerCase()));
  return <Paper variant="outlined" sx={{ p: 2.5, minWidth: 0 }}>
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: "wrap" }}>
      <Typography variant="h6" component="h2" sx={{ mr: "auto !important" }}>{title}</Typography>
      <Button size="small" onClick={() => setRaw(!raw)}>{raw ? "Format JSON" : "Show raw"}</Button>
      <CopyButton label={`Copy ${title.toLowerCase()}`} value={text} />
    </Stack>
    <TextField fullWidth size="small" placeholder={`Search ${title.toLowerCase()}…`} inputProps={{ "aria-label": `Search ${title.toLowerCase()}` }} value={query} onChange={e => setQuery(e.target.value)} sx={{ mb: 2 }} />
    {query && <Typography variant="caption" color="text.secondary">{matching.length} matching lines of {lines.length}</Typography>}
    {!value ? <Typography color="text.secondary" variant="body2">No {title.toLowerCase()} available.</Typography> : query ? <Box component="pre" sx={{ maxHeight: 480, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>
      {matching.length === 0 ? "No matches" : matching.map(line => <Box component="div" key={line.index} sx={{ py: 0.5 }}><Box component="span" sx={{ color: "text.secondary", mr: 2, userSelect: "none" }}>{line.index + 1}</Box>{line.text}</Box>)}
    </Box> : <SyntaxHighlighter language="json" customStyle={{ margin: 0, borderRadius: 8, maxHeight: 480, fontSize: 12, overflow: "auto" }}>{text}</SyntaxHighlighter>}
  </Paper>;
}
