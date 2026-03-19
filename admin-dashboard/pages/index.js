import AdminLayout from "../components/AdminLayout";
import { useState, useEffect } from "react";
import { Users, Bot, Activity, ShoppingBag, Loader2 } from "lucide-react";
import { fetchWithAuth } from "../lib/api";

export default function AdminHome() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth("/api/monitoring/metrics")
      .then((r) => r.json())
      .then(setMetrics)
      .catch((err) => console.error("Failed to load metrics:", err))
      .finally(() => setLoading(false));
  }, []);

  const cards = metrics
    ? [
        { label: "Total Users", value: metrics.totalUsers ?? 0, icon: Users, color: "blue" },
        { label: "Total Agents", value: metrics.totalAgents ?? 0, icon: Bot, color: "emerald" },
        { label: "Active Agents", value: metrics.activeAgents ?? 0, icon: Activity, color: "purple" },
        { label: "Queued Jobs", value: metrics.queue?.waiting ?? 0, icon: ShoppingBag, color: "orange" },
      ]
    : [];

  return (
    <AdminLayout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Admin Overview</h1>
          <p className="text-sm text-slate-400 font-medium mt-1">Platform-wide statistics at a glance.</p>
        </div>

        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((c) => (
              <div key={c.label} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                  c.color === "blue" ? "bg-blue-50 text-blue-600" :
                  c.color === "emerald" ? "bg-emerald-50 text-emerald-600" :
                  c.color === "purple" ? "bg-purple-50 text-purple-600" :
                  "bg-orange-50 text-orange-600"
                }`}>
                  <c.icon size={20} />
                </div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{c.label}</h3>
                <div className="text-3xl font-black text-slate-900">{c.value}</div>
              </div>
            ))}
          </div>
        )}

        {metrics?.queue && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Queue Health</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {Object.entries(metrics.queue).map(([k, v]) => (
                <div key={k} className="text-center p-3 bg-slate-50 rounded-xl">
                  <div className="text-2xl font-black text-slate-900">{v}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1 capitalize">{k}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
