import { useState, useEffect, useRef } from "react";
import Layout from "../../components/layout/Layout";
import { ScrollText, Search, Filter, Loader2, AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";
import { fetchWithAuth } from "../../lib/api";

const LEVEL_CONFIG = {
  agent_deployed: { icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
  agent_deploy_failed: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  agent_stopped: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  snapshot_created: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10" },
};

function getConfig(type) {
  return LEVEL_CONFIG[type] || { icon: Info, color: "text-slate-400", bg: "bg-white/5" };
}

export default function LogsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const bottomRef = useRef();

  useEffect(() => {
    fetchWithAuth("/api/monitoring/events")
      .then((r) => r.json())
      .then((data) => {
        setEvents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = events.filter(
    (e) =>
      e.type?.toLowerCase().includes(filter.toLowerCase()) ||
      e.message?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-3">
              <ScrollText size={24} className="text-blue-400" />
              Activity Logs
            </h1>
            <p className="text-sm text-slate-400 mt-1">Real-time event stream from your agents and platform.</p>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter events..."
              className="pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50 w-72"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <ScrollText size={48} className="mb-4 opacity-30" />
            <p className="text-sm font-medium">No events found</p>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="divide-y divide-white/5">
              {filtered.map((event, i) => {
                const cfg = getConfig(event.type);
                const Icon = cfg.icon;
                return (
                  <div key={event.id || i} className="flex items-start gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                    <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${cfg.bg} mt-0.5`}>
                      <Icon size={16} className={cfg.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                          {event.type}
                        </span>
                      </div>
                      <p className="text-sm text-white mt-1">{event.message}</p>
                    </div>
                    <span className="text-xs text-slate-600 whitespace-nowrap">
                      {event.created_at ? new Date(event.created_at).toLocaleString() : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </Layout>
  );
}
