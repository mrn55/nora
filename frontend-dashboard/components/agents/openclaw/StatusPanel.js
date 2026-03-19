import { useState, useEffect } from "react";
import { fetchWithAuth } from "../../../lib/api";
import { Radio, RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function StatusPanel({ agentId }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/agents/${agentId}/gateway/status`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err.message);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [agentId]);

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-blue-500" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Radio size={14} />
          Gateway Status
        </h3>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-700">Gateway Unreachable</p>
            <p className="text-xs text-red-500 mt-1">{error}</p>
            <p className="text-xs text-red-400 mt-2">
              The gateway may still be starting up. Try refreshing in a few seconds.
            </p>
          </div>
        </div>
      ) : status ? (() => {
        const h = status.health || {};
        const s = status.status || {};
        const version = s.runtimeVersion || h.server?.version || "";
        const sessionCount = s.sessions?.count ?? h.sessions?.count ?? h.agents?.[0]?.sessions?.count;
        const defaultAgent = h.defaultAgentId || s.heartbeat?.defaultAgentId || "main";
        const heartbeatEvery = s.heartbeat?.agents?.[0]?.every || h.heartbeatSeconds ? `${h.heartbeatSeconds}s` : null;
        const uptimeTs = h.ts ? Math.floor((Date.now() - h.ts) / 1000) : null;

        return (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-slate-500 font-medium">Status</span>
              <span className={`flex items-center gap-1.5 text-xs font-bold ${h.ok ? "text-green-600" : "text-yellow-600"}`}>
                {h.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                {h.ok ? "Online" : "Degraded"}
              </span>
            </div>
            {version && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-slate-500 font-medium">Version</span>
                <span className="text-xs font-mono text-slate-700">{version}</span>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-slate-500 font-medium">Default Agent</span>
              <span className="text-xs font-mono text-slate-700">{defaultAgent}</span>
            </div>
            {sessionCount !== undefined && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-slate-500 font-medium">Sessions</span>
                <span className="text-xs font-bold text-slate-700">{sessionCount}</span>
              </div>
            )}
            {heartbeatEvery && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-slate-500 font-medium">Heartbeat</span>
                <span className="text-xs font-mono text-slate-700">{heartbeatEvery}</span>
              </div>
            )}
            {s.sessions?.defaults?.model && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-slate-500 font-medium">Default Model</span>
                <span className="text-xs font-mono text-slate-700">{s.sessions.defaults.model}</span>
              </div>
            )}
          </div>
        );
      })() : null}
    </div>
  );
}
