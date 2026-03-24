import { useState, useRef } from "react";
import { Maximize2, Minimize2, Loader2, AlertTriangle, RefreshCw } from "lucide-react";

export default function OpenClawUIPanel({ agentId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const iframeRef = useRef(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
  const src = `/api/agents/${agentId}/gateway/ui?token=${encodeURIComponent(token)}`;

  function handleLoad() {
    setLoading(false);
    setError(false);
  }

  function handleError() {
    setLoading(false);
    setError(true);
  }

  function reload() {
    setLoading(true);
    setError(false);
    if (iframeRef.current) {
      iframeRef.current.src = src + "&_t=" + Date.now();
    }
  }

  return (
    <div
      className={`bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col ${
        expanded ? "fixed inset-4 z-50 shadow-2xl" : ""
      }`}
      style={expanded ? {} : { height: "calc(100vh - 20rem)", minHeight: 400 }}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
        <span className="text-xs font-bold text-slate-600">OpenClaw Control UI</span>
        <div className="flex items-center gap-2">
          <button
            onClick={reload}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
          >
            <RefreshCw size={11} />
            Reload
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
          >
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            {expanded ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <Loader2 size={24} className="animate-spin text-blue-500" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10 gap-3">
            <AlertTriangle size={32} className="text-amber-500" />
            <p className="text-sm font-bold text-slate-700">Gateway UI unavailable</p>
            <p className="text-xs text-slate-500">The gateway may still be starting up.</p>
            <button
              onClick={reload}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={src}
          onLoad={handleLoad}
          onError={handleError}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="OpenClaw Control UI"
        />
      </div>
    </div>
  );
}
