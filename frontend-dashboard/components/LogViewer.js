import { useState, useEffect, useRef } from "react";
import { Terminal, Wifi, WifiOff, Trash2 } from "lucide-react";

/**
 * Real-time log viewer that connects to the backend WebSocket log stream.
 * Usage: <LogViewer agentId="some-uuid" />
 */
export default function LogViewer({ agentId }) {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const endRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!agentId) return;

    const token = localStorage.getItem("token");
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/ws/logs/${agentId}?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setLogs((prev) => [...prev.slice(-500), data]); // keep last 500 lines
      } catch (err) {
        console.error("Failed to parse log message:", err);
      }
    };

    return () => ws.close();
  }, [agentId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const levelColors = {
    INFO: "text-blue-400",
    WARN: "text-yellow-400",
    ERROR: "text-red-400",
    DEBUG: "text-slate-500",
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-slate-500" />
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Logs</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLogs([])}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            <Trash2 size={12} /> Clear
          </button>
          <div className="flex items-center gap-1.5">
            {connected ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-[10px] text-green-400 font-bold">LIVE</span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-red-400" />
                <span className="text-[10px] text-red-400 font-bold">DISCONNECTED</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Log output */}
      <div className="h-80 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-0.5 scrollbar-thin scrollbar-thumb-slate-800">
        {logs.length === 0 && (
          <p className="text-slate-600 italic">Waiting for logs...</p>
        )}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2 hover:bg-white/[0.02] px-1 -mx-1 rounded">
            {log.timestamp && (
              <span className="text-slate-600 shrink-0">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
            )}
            {log.level && (
              <span className={`font-bold shrink-0 w-12 ${levelColors[log.level] || "text-slate-400"}`}>
                {log.level}
              </span>
            )}
            <span
              className={
                log.type === "system"
                  ? "text-cyan-400"
                  : log.type === "error"
                  ? "text-red-400"
                  : "text-slate-300"
              }
            >
              {log.message}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
