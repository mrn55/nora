import { useState, useEffect, useRef, useCallback } from "react";
import { fetchWithAuth } from "../../lib/api";
import { Cpu, MemoryStick, Network, HardDrive, Clock, Loader2, AlertTriangle } from "lucide-react";
import dynamic from "next/dynamic";

const AreaChart = dynamic(() => import("recharts").then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import("recharts").then(m => m.Area), { ssr: false });
const XAxis = dynamic(() => import("recharts").then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then(m => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then(m => m.ResponsiveContainer), { ssr: false });

const INTERVAL_OPTIONS = [
  { label: "1s", value: 1000 },
  { label: "3s", value: 3000 },
  { label: "5s", value: 5000 },
  { label: "10s", value: 10000 },
  { label: "30s", value: 30000 },
  { label: "1m", value: 60000 },
];

const MAX_POINTS = 120;

function formatUptime(seconds) {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(mb) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${(mb * 1024).toFixed(0)} KB`;
}

export default function MetricsTab({ agentId }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval_] = useState(3000);
  const historyRef = useRef([]);
  const [history, setHistory] = useState([]);
  const prevNetRef = useRef({ rx: 0, tx: 0 });
  const prevDiskRef = useRef({ read: 0, write: 0 });

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/api/agents/${agentId}/stats`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStats(data);
      setError(null);

      // Compute deltas for network and disk (cumulative → rate)
      const netRxDelta = prevNetRef.current.rx ? Math.max(0, data.network_rx_mb - prevNetRef.current.rx) : 0;
      const netTxDelta = prevNetRef.current.tx ? Math.max(0, data.network_tx_mb - prevNetRef.current.tx) : 0;
      prevNetRef.current = { rx: data.network_rx_mb, tx: data.network_tx_mb };

      const diskReadDelta = prevDiskRef.current.read ? Math.max(0, data.disk_read_mb - prevDiskRef.current.read) : 0;
      const diskWriteDelta = prevDiskRef.current.write ? Math.max(0, data.disk_write_mb - prevDiskRef.current.write) : 0;
      prevDiskRef.current = { read: data.disk_read_mb, write: data.disk_write_mb };

      const point = {
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        cpu: data.cpu_percent,
        memory: data.memory_percent,
        memoryMb: data.memory_usage_mb,
        netRx: netRxDelta,
        netTx: netTxDelta,
        diskRead: diskReadDelta,
        diskWrite: diskWriteDelta,
      };
      historyRef.current = [...historyRef.current.slice(-(MAX_POINTS - 1)), point];
      setHistory([...historyRef.current]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    // Reset history on interval change
    historyRef.current = [];
    prevNetRef.current = { rx: 0, tx: 0 };
    prevDiskRef.current = { read: 0, write: 0 };
    setHistory([]);

    fetchStats();
    const id = setInterval(fetchStats, interval);
    return () => clearInterval(id);
  }, [agentId, interval, fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-500" size={24} />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-center gap-3">
        <AlertTriangle size={20} className="text-red-500 shrink-0" />
        <div>
          <p className="text-sm font-bold text-red-700">Cannot fetch container stats</p>
          <p className="text-xs text-red-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const s = stats || {};

  return (
    <div className="space-y-4">
      {/* Toolbar: interval selector + summary */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Refresh:</span>
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setInterval_(opt.value)}
                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                  interval === opt.value
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span><Clock size={10} className="inline mr-1" />Uptime: <strong className="text-slate-600">{formatUptime(s.uptime_seconds)}</strong></span>
          <span>PIDs: <strong className="text-slate-600">{s.pids || 0}</strong></span>
          <span>{history.length} samples</span>
        </div>
      </div>

      {/* 4-panel chart grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard
          title="CPU Usage"
          icon={Cpu}
          current={`${s.cpu_percent?.toFixed(1) || 0}%`}
          color="#3b82f6"
          data={history}
          dataKey="cpu"
          unit="%"
          domain={[0, "auto"]}
        />
        <ChartCard
          title="Memory Usage"
          icon={MemoryStick}
          current={`${formatBytes(s.memory_usage_mb || 0)} / ${formatBytes(s.memory_limit_mb || 0)} (${s.memory_percent?.toFixed(1) || 0}%)`}
          color="#a855f7"
          data={history}
          dataKey="memory"
          unit="%"
          domain={[0, 100]}
        />
        <ChartCard
          title="Network I/O"
          icon={Network}
          current={`↓ ${formatBytes(s.network_rx_mb || 0)}  ↑ ${formatBytes(s.network_tx_mb || 0)} (cumulative)`}
          color="#10b981"
          secondColor="#f59e0b"
          data={history}
          dataKey="netRx"
          secondDataKey="netTx"
          unit=" MB"
          legend={["Received", "Sent"]}
        />
        <ChartCard
          title="Disk I/O"
          icon={HardDrive}
          current={`Read: ${formatBytes(s.disk_read_mb || 0)}  Write: ${formatBytes(s.disk_write_mb || 0)} (cumulative)`}
          color="#06b6d4"
          secondColor="#f97316"
          data={history}
          dataKey="diskRead"
          secondDataKey="diskWrite"
          unit=" MB"
          legend={["Read", "Write"]}
        />
      </div>
    </div>
  );
}

function ChartCard({ title, icon: Icon, current, color, secondColor, data, dataKey, secondDataKey, unit, domain, legend }) {
  const gradId = `grad-${dataKey}`;
  const gradId2 = secondDataKey ? `grad-${secondDataKey}` : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Icon size={12} className="text-slate-500" />
          <span className="text-xs font-bold text-slate-700">{title}</span>
        </div>
        <span className="text-[10px] text-slate-500 font-medium">{current}</span>
      </div>

      <div style={{ height: 140 }}>
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
                {gradId2 && (
                  <linearGradient id={gradId2} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={secondColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={secondColor} stopOpacity={0.02} />
                  </linearGradient>
                )}
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9 }} domain={domain || [0, "auto"]} width={35} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 10, borderRadius: 8, border: "1px solid #e2e8f0", padding: "4px 8px" }}
                formatter={(v, name) => {
                  const label = legend
                    ? (name === dataKey ? legend[0] : legend[1])
                    : title;
                  return [`${typeof v === 'number' ? v.toFixed(2) : v}${unit || ""}`, label];
                }}
              />
              <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${gradId})`} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              {secondDataKey && (
                <Area type="monotone" dataKey={secondDataKey} stroke={secondColor} fill={`url(#${gradId2})`} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-[10px] text-slate-400">
            Collecting data...
          </div>
        )}
      </div>

      {legend && data.length > 1 && (
        <div className="flex items-center justify-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-[9px] text-slate-500">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} /> {legend[0]}
          </span>
          <span className="flex items-center gap-1 text-[9px] text-slate-500">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: secondColor }} /> {legend[1]}
          </span>
        </div>
      )}
    </div>
  );
}
