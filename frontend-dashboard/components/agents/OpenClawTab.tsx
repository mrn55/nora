import { useEffect, useState } from "react";
import {
  CalendarClock,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  Puzzle,
  Radio,
} from "lucide-react";
import ChannelsTab from "./ChannelsTab";
import StatusPanel from "./openclaw/StatusPanel";
import ChatPanel from "./openclaw/ChatPanel";
import IntegrationsTab from "./IntegrationsTab";
import ClawHubTab from "./openclaw/ClawHubTab";
import CronPanel from "./openclaw/CronPanel";
import OpenClawUIPanel from "./openclaw/OpenClawUIPanel";

const subTabs = [
  { id: "official-dashboard", label: "Official Dashboard", icon: LayoutDashboard },
  { id: "status", label: "Status", icon: Radio },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "integrations", label: "Integrations", icon: Puzzle },
  { id: "clawhub", label: "ClawHub", icon: Puzzle },
  { id: "cron", label: "Cron", icon: CalendarClock },
  { id: "channels", label: "Channels", icon: MessagesSquare },
];

function OpenClawChannelsPanel({ agentId }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">
          Managed Channels
        </p>
        <p className="mt-1 text-sm font-bold text-slate-900">
          These channels follow Nora&apos;s managed CLI-style channel workflow for OpenClaw agents.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Create, test, and inspect channels here the same way you would through the managed CLI
          path, without relying on Hermes-only runtime configuration.
        </p>
      </div>
      <ChannelsTab agentId={agentId} />
    </div>
  );
}

export default function OpenClawTab({
  agentId,
  agentStatus,
  agentContainerId,
  onClawhubInstallSuccess,
}) {
  const [activeSubTab, setActiveSubTab] = useState("official-dashboard");

  useEffect(() => {
    setActiveSubTab("official-dashboard");
  }, [agentId]);

  if (agentStatus !== "running" && agentStatus !== "warning") {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
        <Radio size={32} className="text-slate-400" />
        <p className="text-sm text-slate-500 font-medium">
          OpenClaw Gateway available when agent is{" "}
          <span className="text-green-500 font-bold">running</span>
        </p>
        <p className="text-xs text-slate-400">
          Agent is currently <span className="font-bold">{agentStatus}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-xl overflow-x-auto scrollbar-hide w-full">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                isActive
                  ? "bg-white text-blue-600 shadow-sm border border-blue-100"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={12} />
              <span className="hidden xs:inline sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-panel content */}
      <div>
        {activeSubTab === "official-dashboard" && <OpenClawUIPanel agentId={agentId} />}
        {activeSubTab === "status" && <StatusPanel agentId={agentId} />}
        {activeSubTab === "chat" && <ChatPanel agentId={agentId} />}
        {activeSubTab === "integrations" && <IntegrationsTab agentId={agentId} />}
        {activeSubTab === "clawhub" && (
          <ClawHubTab
            agentId={agentId}
            refreshToken={agentContainerId || agentStatus}
            onInstallSuccess={onClawhubInstallSuccess}
          />
        )}
        {activeSubTab === "cron" && <CronPanel agentId={agentId} />}
        {activeSubTab === "channels" && <OpenClawChannelsPanel agentId={agentId} />}
      </div>
    </div>
  );
}
