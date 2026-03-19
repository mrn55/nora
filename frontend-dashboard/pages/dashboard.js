import Layout from "../components/layout/Layout";
import { Activity, Zap, Bot, Cpu, HardDrive, ShoppingBag, ArrowUpRight, Plus, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { fetchWithAuth } from "../lib/api";

export default function Dashboard() {
  const [agents, setAgents] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchWithAuth("/api/agents").then(r => r.json()),
      fetchWithAuth("/api/monitoring/metrics").then(r => r.json()).catch(() => null),
    ]).then(([agentData, metricsData]) => {
      setAgents(agentData);
      setMetrics(metricsData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="flex flex-col gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">System Overview</h1>
          <p className="text-slate-400 font-medium">Global status of your Nora fleet.</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
          <StatCard title="Active Nodes" value={metrics?.activeAgents ?? agents.filter(a => a.status === "running").length} icon={Zap} color="blue" />
          <StatCard title="Total Agents" value={metrics?.totalAgents ?? agents.length} icon={Bot} color="emerald" />
          <StatCard title="Queued Jobs" value={metrics?.queue?.waiting ?? 0} icon={Cpu} color="purple" />
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Recent Deployments</h2>
            <a href="/app/agents" className="text-sm font-bold text-blue-600 hover:underline">View All</a>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-[2.5rem] overflow-hidden shadow-sm">
             {loading ? (
                <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-blue-500" /></div>
             ) : agents.length === 0 ? (
                <div className="p-12 sm:p-20 flex flex-col items-center gap-4 text-slate-400">
                   <Bot size={40} />
                   <span className="text-sm font-bold uppercase tracking-widest">No agents deployed yet</span>
                   <a href="/app/deploy" className="bg-blue-600 text-white px-6 py-3 rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20">Deploy First Agent</a>
                </div>
             ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                   <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                         <th className="px-4 sm:px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Agent</th>
                         <th className="px-4 sm:px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                         <th className="px-4 sm:px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">Node</th>
                         <th className="px-4 sm:px-8 py-4"></th>
                      </tr>
                   </thead>
                   <tbody>
                      {agents.slice(0, 5).map(agent => (
                         <tr key={agent.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 sm:px-8 py-4">
                               <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold shrink-0">
                                     <Bot size={16} />
                                  </div>
                                  <span className="font-bold text-slate-900 truncate">{agent.name}</span>
                               </div>
                            </td>
                            <td className="px-4 sm:px-8 py-4">
                               <div className="flex items-center gap-1.5">
                                  <div className={clsx("w-1.5 h-1.5 rounded-full", agent.status === "running" ? "bg-emerald-500" : "bg-blue-500")}></div>
                                  <span className="text-xs font-bold text-slate-600 capitalize">{agent.status}</span>
                               </div>
                            </td>
                            <td className="px-4 sm:px-8 py-4 text-xs font-medium text-slate-500 hidden sm:table-cell">{agent.node || "LocalNode"}</td>
                            <td className="px-4 sm:px-8 py-4 text-right">
                               <a href="/app/agents" className="inline-flex p-2 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all">
                                  <ArrowUpRight size={16} className="text-slate-400" />
                                </a>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
                </div>
             )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ title, value, icon: Icon, color }) {
   return (
      <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col gap-4 sm:gap-6 group hover:shadow-xl transition-all">
         <div className={clsx(
            "w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-110",
            color === "blue" ? "bg-blue-50 text-blue-600" :
            color === "emerald" ? "bg-emerald-50 text-emerald-600" :
            "bg-purple-50 text-purple-600"
         )}>
            <Icon size={24} />
         </div>
         <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</span>
            <span className="text-3xl font-black text-slate-900">{value}</span>
         </div>
      </div>
   );
}
