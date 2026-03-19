import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal as TermIcon, Wifi, WifiOff, Maximize2, Minimize2 } from "lucide-react";

const TOOLBAR_HEIGHT = 37; // px — matches py-2 + content

/**
 * Interactive web terminal connected to an agent container via WebSocket.
 * Uses xterm.js for proper terminal emulation (VT100, colors, cursor, etc.).
 */
export default function AgentTerminal({ agentId }) {
  const termRef = useRef(null);
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Connecting...");
  const [expanded, setExpanded] = useState(false);
  const [xtermLoaded, setXtermLoaded] = useState(false);

  // Fit helper
  const doFit = useCallback(() => {
    if (!fitAddonRef.current || !termRef.current) return;
    try { fitAddonRef.current.fit(); } catch { /* teardown */ }
  }, []);

  // Send current terminal size to the remote PTY
  const sendResize = useCallback(() => {
    if (!fitAddonRef.current || !wsRef.current || wsRef.current.readyState !== 1) return;
    try {
      const dims = fitAddonRef.current.proposeDimensions();
      if (dims) wsRef.current.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
    } catch { /* ignore */ }
  }, []);

  // Dynamically import xterm.js (CSR only)
  const initTerminal = useCallback(async () => {
    const el = containerRef.current;
    if (!el || termRef.current) return;

    // Poll until the container has measurable dimensions (max 2s, 50ms interval)
    const deadline = Date.now() + 2000;
    while (el.clientHeight < 20 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      if (!containerRef.current) return; // unmounted
    }

    const { Terminal } = await import("@xterm/xterm");
    const { FitAddon } = await import("@xterm/addon-fit");
    const { WebLinksAddon } = await import("@xterm/addon-web-links");

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: "#0a0e1a",
        foreground: "#e2e8f0",
        cursor: "#3b82f6",
        cursorAccent: "#0a0e1a",
        selectionBackground: "rgba(59, 130, 246, 0.3)",
        black: "#1e293b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e2e8f0",
        brightBlack: "#475569",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#f8fafc",
      },
      allowProposedApi: true,
      scrollback: 5000,
    });

    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(el);
    // Triple-fit: immediate, +100ms, +500ms to cover render, layout shift, and scrollbar appearance
    fitAddon.fit();
    setTimeout(() => { try { fitAddon.fit(); } catch {} }, 100);
    setTimeout(() => { try { fitAddon.fit(); } catch {} }, 500);

    termRef.current = term;
    setXtermLoaded(true);
    return term;
  }, []);

  // Connect WebSocket
  useEffect(() => {
    if (!agentId || !xtermLoaded || !termRef.current) return;
    const term = termRef.current;
    const token = localStorage.getItem("token");
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/ws/exec/${agentId}?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setStatus("Connected");
      doFit();
      setTimeout(sendResize, 80);
      // Re-fit after first PTY data may change scrollbar visibility
      setTimeout(() => { doFit(); sendResize(); }, 300);
    };
    ws.onclose = () => {
      setConnected(false);
      setStatus("Disconnected");
      term.writeln("\r\n\x1b[90m--- Session ended ---\x1b[0m");
    };
    ws.onerror = () => {
      setConnected(false);
      setStatus("Connection error");
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "output") term.write(msg.data);
        else if (msg.type === "system") term.writeln(`\r\n\x1b[36m${msg.message}\x1b[0m`);
        else if (msg.type === "error") term.writeln(`\r\n\x1b[31m${msg.message}\x1b[0m`);
      } catch { term.write(e.data); }
    };
    const onData = term.onData((data) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: "input", data }));
    });
    return () => { onData.dispose(); ws.close(); };
  }, [agentId, xtermLoaded, doFit, sendResize]);

  // Mount terminal
  useEffect(() => {
    initTerminal();
    return () => {
      if (termRef.current) { termRef.current.dispose(); termRef.current = null; setXtermLoaded(false); }
    };
  }, [initTerminal]);

  // ResizeObserver + window resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let rafId = null;
    const handleResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => { doFit(); sendResize(); });
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(el);
    window.addEventListener("resize", handleResize);
    // After expand/collapse, the layout needs time to settle — refit aggressively
    const t1 = setTimeout(handleResize, 50);
    const t2 = setTimeout(handleResize, 150);
    const t3 = setTimeout(handleResize, 400);
    return () => { ro.disconnect(); window.removeEventListener("resize", handleResize); if (rafId) cancelAnimationFrame(rafId); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [expanded, doFit, sendResize]);

  return (
    <div
      ref={wrapperRef}
      className={`bg-[#0a0e1a] border border-slate-800 rounded-2xl overflow-hidden flex flex-col ${
        expanded ? "fixed inset-4 z-50 shadow-2xl" : "w-full"
      }`}
      style={expanded ? {} : { height: "100%" }}
    >
      {/* Toolbar */}
      <div style={{ height: TOOLBAR_HEIGHT, flexShrink: 0 }} className="flex items-center justify-between px-4 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <TermIcon size={14} className="text-slate-500" />
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Terminal</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
            title={expanded ? "Minimize" : "Maximize"}
          >
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <div className="flex items-center gap-1.5">
            {connected ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-[10px] text-green-400 font-bold">{status}</span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-red-400" />
                <span className="text-[10px] text-red-400 font-bold">{status}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Terminal container — flex-1 fills remaining space, min-h-0 prevents flex overflow */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ backgroundColor: "#0a0e1a" }}
      />
    </div>
  );
}
