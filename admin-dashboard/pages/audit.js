import AdminLayout from "../components/AdminLayout";
import { fetchWithAuth } from "../lib/api";
import {
  FileText,
  Loader2,
  Bot,
  ShoppingBag,
  AlertCircle,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { useState, useEffect } from "react";

const eventIcons = {
  agent_deployed: { icon: Bot, color: "text-blue-500" },
  marketplace_install: { icon: ShoppingBag, color: "text-purple-500" },
  error: { icon: AlertCircle, color: "text-red-500" },
  default: { icon: Activity, color: "text-slate-400" },
};

export default function AuditPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth("/api/admin/audit")
      .then((res) => res.json())
      .then((data) => {
        setEvents(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-1">
            System events and deployment history.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-16 flex justify-center">
              <Loader2 size={28} className="animate-spin text-red-500" />
            </div>
          ) : events.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <FileText size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No events recorded yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {events.map((event) => {
                const config =
                  eventIcons[event.type] || eventIcons.default;
                const Icon = config.icon;
                return (
                  <div
                    key={event.id}
                    className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-all"
                  >
                    <div className={`${config.color}`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {event.message}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {event.type} &middot;{" "}
                        {new Date(event.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
