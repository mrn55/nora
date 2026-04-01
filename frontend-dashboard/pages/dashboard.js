import Layout from "../components/layout/Layout";
import { Activity, Zap, Bot, Cpu, ArrowUpRight, Loader2, KeyRound, Rocket, MessagesSquare } from "lucide-react";
import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { fetchWithAuth } from "../lib/api";

export default function Dashboard() {
  const [agents, setAgents] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchWithAuth("/api/agents").then((r) => r.json()),
      fetchWithAuth("/api/monitoring/metrics").then((r) => r.json()).catch(() => null),
    ])
      .then(([agentData, metricsData]) => {
        setAgents(agentData);
        setMetrics(metricsData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const hasAgents = agents.length > 0;

  return (
    <Layout>
      <div className="flex flex-col gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">System Overview</h1>
          <p className="text-slate-400 font-medium">
            Global status of your Nora fleet.
            {!hasAgents && !loading ? " Start with provider setup, then deploy your first OpenClaw agent." : ""}
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
          <StatCard title="Active Nodes" value={metrics?.activeAgents ?? agents.filter((a) => a.status === "running").length} icon={Zap} color="blue" />
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
            ) : !hasAgents ? (
              <EmptyState />
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
                    {agents.slice(0, 5).map((agent) => (
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

function EmptyState() {
  const steps = [
    {
      icon: KeyRound,
      title: "Add an LLM provider",
      desc: "Save one provider key in Settings so Nora can sync it to agents.",
      href: "/app/settings",
      cta: "Open Settings",
      accent: "blue",
    },
    {
      icon: Rocket,
      title: "Deploy your first agent",
      desc: "Choose a runtime, set resources, and launch an OpenClaw agent.",
      href: "/app/deploy",
      cta: "Deploy Agent",
      accent: "emerald",
    },
    {
      icon: MessagesSquare,
      title: "Validate the runtime",
      desc: "Use chat, logs, and terminal to confirm the agent is healthy and ready.",
      href: "/app/agents",
      cta: "View Agents",
      accent: "purple",
    },
  ];

  return (
    <div className="p-8 sm:p-12 lg:p-14 space-y-8">
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
          <Bot size={30} />
        </div>
        <h3 className="text-2xl font-black text-slate-900">No agents deployed yet</h3>
        <p className="text-sm sm:text-base text-slate-500 leading-relaxed">
          Nora is most valuable once you complete the first-run loop: add a provider key, deploy an OpenClaw agent, then verify chat, logs, and terminal from one control plane.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {steps.map((step, index) => {
          const accent =
            step.accent === "emerald"
              ? "bg-emerald-50 text-emerald-600 border-emerald-100"
              : step.accent === "purple"
                ? "bg-purple-50 text-purple-600 border-purple-100"
                : "bg-blue-50 text-blue-600 border-blue-100";

          return (
            <div key={step.title} className="border border-slate-200 rounded-3xl p-6 bg-slate-50/60 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-xs font-black">
                  {index + 1}
                </div>
                <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center ${accent}`}>
                  <step.icon size={18} />
                </div>
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-900 mb-2">{step.title}</h4>
                <p className="text-sm text-slate-500 leading-relaxed">{step.desc}</p>
              </div>
              <a href={step.href} className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline">
                {step.cta}
                <ArrowUpRight size={14} />
              </a>
            </div>
          );
        })}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black text-blue-700 uppercase tracking-widest mb-1">Recommended order</p>
          <p className="text-sm text-blue-700/80">Settings → Deploy → Agents. That is the fastest path to first proof of value.</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/app/settings" className="px-4 py-2.5 bg-white border border-blue-200 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-50 transition-all">
            Settings
          </a>
          <a href="/app/deploy" className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all">
            Deploy First Agent
          </a>
        </div>
      </div>
    </div>
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
