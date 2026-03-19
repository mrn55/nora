import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Layout from "../../components/layout/Layout";
import TabBar from "../../components/agents/TabBar";
import OverviewTab from "../../components/agents/OverviewTab";
import LogsTab from "../../components/agents/LogsTab";
import OpenClawTab from "../../components/agents/OpenClawTab";
import SettingsTab from "../../components/agents/SettingsTab";
import NemoClawTab from "../../components/agents/NemoClawTab";
import StatusBadge from "../../components/agents/StatusBadge";
import { useToast } from "../../components/Toast";
import { fetchWithAuth } from "../../lib/api";
import {
  Bot, Loader2, ArrowLeft, Terminal
} from "lucide-react";

const AgentTerminal = dynamic(() => import("../../components/AgentTerminal"), { ssr: false });

export default function AgentDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const toast = useToast();

  const refreshAgent = () => {
    if (!id) return;
    fetchWithAuth(`/api/agents/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setAgent)
      .catch(() => {});
  };

  useEffect(() => {
    if (!id) return;
    fetchWithAuth(`/api/agents/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setAgent)
      .catch(() => setAgent(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Poll for status updates every 10s (reconciles live container state)
  useEffect(() => {
    if (!id || loading) return;
    const interval = setInterval(refreshAgent, 10000);
    return () => clearInterval(interval);
  }, [id, loading]);

  async function handleAction(action) {
    setActionLoading(action);
    try {
      const endpoint =
        action === "start" ? `/api/agents/${id}/start` :
        action === "stop" ? `/api/agents/${id}/stop` :
        action === "restart" ? `/api/agents/${id}/restart` :
        action === "redeploy" ? `/api/agents/${id}/redeploy` : null;
      if (!endpoint) return;

      const res = await fetchWithAuth(endpoint, { method: "POST" });
      if (res.ok) {
        const statusMap = { start: "running", stop: "stopped", restart: "running", redeploy: "queued" };
        setAgent((a) => ({ ...a, status: statusMap[action] || a.status }));
        toast.success(`Agent ${action === "redeploy" ? "re-queued" : action + (action.endsWith("e") ? "d" : "ed")}`);
        // Refresh to get authoritative state from server
        setTimeout(refreshAgent, 2000);
      } else {
        const data = await res.json();
        toast.error(data.error || `Failed to ${action} agent`);
      }
    } catch (err) {
      console.error(err);
      toast.error(`Failed to ${action} agent`);
    }
    setActionLoading("");
  }

  async function handleDelete() {
    setActionLoading("delete");
    try {
      const res = await fetchWithAuth(`/api/agents/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Agent deleted");
        router.push("/app/agents");
      } else {
        toast.error("Failed to delete agent");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete agent");
    }
    setActionLoading("");
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      </Layout>
    );
  }

  if (!agent) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-96 text-slate-500">
          <Bot size={48} className="mb-4 opacity-30" />
          <p className="text-lg font-bold mb-4">Agent not found</p>
          <a href="/app/agents" className="flex items-center gap-2 text-blue-400 hover:underline text-sm">
            <ArrowLeft size={16} /> Back to Agents
          </a>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="w-full max-w-full space-y-4 sm:space-y-6">
        {/* Header Bar */}
        <div className="flex items-center justify-between min-w-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <a href="/app/agents" className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
              <ArrowLeft size={20} />
            </a>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
              <Bot size={20} className="text-white sm:hidden" />
              <Bot size={24} className="text-white hidden sm:block" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 truncate">{agent.name}</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <StatusBadge status={agent.status} />
                <span className="text-[10px] text-slate-400 font-mono">{agent.id.slice(0, 8)}</span>
                {agent.backend_type && agent.backend_type !== "docker" && (
                  <span className="text-[10px] text-slate-400 font-bold uppercase px-2 py-0.5 bg-slate-100 rounded">
                    {agent.backend_type}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} sandboxType={agent.sandbox_type} />

        {/* Tab Content */}
        <div className={`w-full min-w-0 overflow-x-hidden ${activeTab === "terminal" ? "" : "min-h-[400px]"}`}>
          {activeTab === "overview" && (
            <OverviewTab
              agent={agent}
              actionLoading={actionLoading}
              onStart={() => handleAction("start")}
              onStop={() => handleAction("stop")}
              onRestart={() => handleAction("restart")}
              onRedeploy={() => handleAction("redeploy")}
            />
          )}

          {activeTab === "terminal" && (
            agent.status === "running" ? (
              <div style={{ height: "calc(100vh - 17rem)", minHeight: "300px" }}>
                <AgentTerminal agentId={id} />
              </div>
            ) : (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
                <Terminal size={32} className="text-slate-700" />
                <p className="text-sm text-slate-500 font-medium">
                  Terminal available when agent is <span className="text-green-400 font-bold">running</span>
                </p>
                <p className="text-xs text-slate-600">
                  Agent is currently <span className="font-bold">{agent.status}</span>
                </p>
              </div>
            )
          )}

          {activeTab === "logs" && <LogsTab agentId={id} />}

          {activeTab === "openclaw" && <OpenClawTab agentId={id} agentStatus={agent.status} />}

          {activeTab === "nemoclaw" && agent.sandbox_type === "nemoclaw" && (
            <NemoClawTab agentId={id} agentStatus={agent.status} />
          )}

          {activeTab === "settings" && (
            <SettingsTab
              agent={agent}
              actionLoading={actionLoading}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
