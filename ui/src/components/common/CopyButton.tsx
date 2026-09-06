import { useState } from "react";
import { Button, Snackbar } from "@mui/material";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";

export default function CopyButton({ value, label = "Copy", link = false }: { value?: string; label?: string; link?: boolean }) {
  const [message, setMessage] = useState("");
  const copy = async () => {
    let text = value || "";
    if (link) { const url = new URL(window.location.href); url.username = ""; url.password = ""; text = url.toString(); }
    try { await navigator.clipboard.writeText(text); setMessage(link ? "Link copied" : "Copied to clipboard"); }
    catch { setMessage("Could not copy. Select and copy the text manually."); }
  };
  return <><Button size="small" startIcon={<ContentCopyOutlined fontSize="small" />} onClick={copy}>{label}</Button><Snackbar open={Boolean(message)} message={message} autoHideDuration={4000} onClose={() => setMessage("")} /></>;
}
