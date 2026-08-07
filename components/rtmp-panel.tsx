"use client";

import { useState } from "react";
import { Radio, ShieldCheck } from "lucide-react";

export type RtmpConfig = { label: string; serverUrl: string; streamKey: string };

export function RtmpPanel({ onSave }: { onSave: (config: RtmpConfig) => Promise<void> | void }) {
  const [label, setLabel] = useState("Primary RTMP");
  const [serverUrl, setServerUrl] = useState("");
  const [streamKey, setStreamKey] = useState("");
  const [message, setMessage] = useState("");

  async function save() {
    if (!/^rtmps?:\/\//i.test(serverUrl.trim())) return setMessage("Enter a valid RTMP or RTMPS server URL.");
    if (streamKey.trim().length < 6) return setMessage("Enter a valid stream key.");
    await onSave({ label: label.trim() || "Custom RTMP", serverUrl: serverUrl.trim(), streamKey: streamKey.trim() });
    setMessage("RTMP destination is ready to save securely.");
  }

  return <div className="integrationCard">
    <div className="integrationHeader"><Radio size={20}/><div><strong>Custom RTMP</strong><span>Connect a destination using its RTMP server and stream key.</span></div></div>
    <div className="formStack"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Destination label"/><input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="rtmps://live.example.com/app"/><input type="password" value={streamKey} onChange={(e) => setStreamKey(e.target.value)} placeholder="Stream key"/></div>
    <button className="primaryButton full" onClick={save}><ShieldCheck size={17}/> Save RTMP Destination</button>
    {message && <small className="helperText">{message}</small>}
  </div>;
}
