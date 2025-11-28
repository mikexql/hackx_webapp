'use client';
import { useEffect, useState } from "react";

export function FoxgloveDebug() {
  const [status, setStatus] = useState("idle");
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_FOXGLOVE_WS_URL;
    if (!url) {
      setStatus("no env");
      console.error("❌ NEXT_PUBLIC_FOXGLOVE_WS_URL not set!");
      return;
    }

    setStatus("connecting");
    const ws = new WebSocket(url, "foxglove.websocket.v1");
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setStatus("open");
      setLog((p) => ["✅ Connected", ...p]);
    };
    ws.onmessage = (e) => {
      if (typeof e.data === "string") setLog((p) => [`📨 ${e.data}`, ...p]);
      else setLog((p) => [`📦 Binary ${e.data.byteLength} bytes`, ...p]);
    };
    ws.onerror = () => setStatus("error");
    ws.onclose = (evt) =>
      setLog((p) => [`🔌 Closed (code=${evt.code})`, ...p]);

    return () => ws.close();
  }, []);

  return (
    <div>
      <h3>Status: {status}</h3>
      <pre>{log.join("\n")}</pre>
    </div>
  );
}
