import Layout from "../../components/layout/Layout";
import { useState, useEffect } from "react";
import { Rocket, Zap, Server, Shield, Loader2, CheckCircle2, Cpu, HardDrive, MemoryStick, AlertTriangle, ShieldCheck, Brain } from "lucide-react";
import { fetchWithAuth } from "../../lib/api";
import { useToast } from "../../components/Toast";

export default function Deploy() {
  const [name, setName] = useState("");
  const [containerName, setContainerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [sub, setSub] = useState(null);
  const [agentCount, setAgentCount] = useState(0);
  const [sandbox, setSandbox] = useState("standard");
  const [nemoConfig, setNemoConfig] = useState(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [platformConfig, setPlatformConfig] = useState(null);
  const [selVcpu, setSelVcpu] = useState(2);
  const [selRam, setSelRam] = useState(2048);
  const [selDisk, setSelDisk] = useState(20);
  const toast = useToast();

  useEffect(() => {
    fetchWithAuth("/api/billing/subscription")
      .then((r) => r.json())
      .then(setSub)
      .catch((err) => console.error(err));
    fetchWithAuth("/api/agents")
      .then((r) => r.json())
      .then((data) => setAgentCount(Array.isArray(data) ? data.length : 0))
      .catch((err) => console.error(err));
    fetch("/api/config/nemoclaw")
      .then((r) => r.json())
      .then((cfg) => {
        setNemoConfig(cfg);
        if (cfg.defaultModel) setSelectedModel(cfg.defaultModel);
      })
      .catch(() => {});
    fetch("/api/config/platform")
      .then((r) => r.json())
      .then(setPlatformConfig)
      .catch(() => {});
  }, []);

  const isSelfHosted = platformConfig?.mode !== "paas";
  const plan = sub?.plan || "free";
  const planLabel = isSelfHosted ? "Self-hosted" : plan.charAt(0).toUpperCase() + plan.slice(1);
  const limit = isSelfHosted ? (platformConfig?.selfhosted?.max_agents || 50) : (sub?.agent_limit || 3);
  const vcpu = isSelfHosted ? selVcpu : (sub?.vcpu || 2);
  const ram = isSelfHosted ? selRam : (sub?.ram_mb || 2048);
  const disk = isSelfHosted ? selDisk : (sub?.disk_gb || 20);
  const atLimit = agentCount >= limit;

  async function deploy() {
    if (atLimit) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/agents/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sandbox,
          ...(containerName.trim() ? { container_name: containerName.trim() } : {}),
          ...(sandbox === "nemoclaw" && selectedModel ? { model: selectedModel } : {}),
          ...(isSelfHosted ? { vcpu: selVcpu, ram_mb: selRam, disk_gb: selDisk } : {}),
        }),
      });
      if (res.ok) {
        window.location.href = "/app/agents";
      } else if (res.status === 402) {
        toast.error("You've reached your plan's agent limit. Please upgrade.");
      } else {
        toast.error("Deployment failed. Please try again.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error during deployment.");
    }
    setLoading(false);
  }

  return (
    <Layout>
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-8 sm:gap-10">
        <header className="flex flex-col gap-2">
           <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                 <Rocket size={28} strokeWidth={2.5} />
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-none">Deploy New Agent</h1>
           </div>
           <p className="text-slate-400 font-medium">Provision a new autonomous OpenClaw agent to your cluster.</p>
        </header>

        {/* Plan usage banner */}
        <div className={`flex items-center justify-between p-5 rounded-2xl border ${atLimit ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-100"}`}>
          <div className="flex items-center gap-3">
            {atLimit ? <AlertTriangle size={20} className="text-red-500" /> : <Shield size={20} className="text-blue-600" />}
            <div>
              <p className={`text-sm font-bold ${atLimit ? "text-red-700" : "text-blue-700"}`}>
                {planLabel} Plan — {agentCount}/{limit} agents used
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {atLimit
                  ? (isSelfHosted ? "Contact your administrator to increase the limit." : "Upgrade your plan to deploy more agents.")
                  : `${limit - agentCount} deployment slot${limit - agentCount !== 1 ? "s" : ""} remaining.`}
              </p>
            </div>
          </div>
          {atLimit && !isSelfHosted && (
            <a href="/pricing" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all">
              Upgrade
            </a>
          )}
        </div>

        <div className="bg-white p-6 sm:p-10 rounded-2xl sm:rounded-[2.5rem] border border-slate-200 shadow-2xl shadow-slate-200/50 flex flex-col gap-8">
           <div className="flex flex-col gap-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none ml-2">Agent Name</label>
              <input
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 outline-none transition-all focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500/40 placeholder:text-slate-400"
                placeholder="e.g. Research-Node-Alpha"
                value={name}
                onChange={e => setName(e.target.value)}
              />
           </div>

           <div className="flex flex-col gap-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none ml-2">Container Name <span className="text-slate-300 font-medium normal-case tracking-normal">(optional)</span></label>
              <input
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 font-mono outline-none transition-all focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500/40 placeholder:text-slate-400 placeholder:font-sans"
                placeholder="Auto-generated if left empty"
                value={containerName}
                onChange={e => setContainerName(e.target.value)}
              />
           </div>

           {/* Deploy Mode Selector */}
             <div className="flex flex-col gap-3">
               <label className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none ml-2">Deploy Mode</label>
               <div className="grid grid-cols-2 gap-3">
                 <button
                   type="button"
                   onClick={() => setSandbox("standard")}
                   className={`p-4 rounded-2xl border-2 text-left transition-all ${
                     sandbox === "standard"
                       ? "border-blue-500 bg-blue-50"
                       : "border-slate-200 bg-slate-50 hover:border-slate-300"
                   }`}
                 >
                   <div className="flex items-center gap-2 mb-1">
                     <Server size={16} className="text-blue-600" />
                     <span className="text-sm font-bold text-slate-900">OpenClaw + Docker</span>
                   </div>
                   <p className="text-[10px] text-slate-500">Default containerised runtime using Docker</p>
                 </button>
                 <button
                   type="button"
                   onClick={() => { if (nemoConfig?.enabled) setSandbox("nemoclaw"); }}
                   className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
                     !nemoConfig?.enabled
                       ? "border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed"
                       : sandbox === "nemoclaw"
                         ? "border-green-500 bg-green-50"
                         : "border-slate-200 bg-slate-50 hover:border-slate-300"
                   }`}
                   disabled={!nemoConfig?.enabled}
                 >
                   <div className="flex items-center gap-2 mb-1">
                     <ShieldCheck size={16} className={nemoConfig?.enabled ? "text-green-600" : "text-slate-400"} />
                     <span className="text-sm font-bold text-slate-900">NemoClaw + OpenClaw</span>
                   </div>
                   <p className="text-[10px] text-slate-500">NVIDIA secure sandbox with Nemotron inference</p>
                   {!nemoConfig?.enabled && (
                     <p className="text-[10px] text-amber-600 font-medium mt-1">Enable NemoClaw in .env to use this mode</p>
                   )}
                 </button>
               </div>
             </div>

           {/* NemoClaw Model Picker */}
           {sandbox === "nemoclaw" && nemoConfig?.models?.length > 0 && (
             <div className="flex flex-col gap-3">
               <label className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none ml-2">Nemotron Model</label>
               <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-2xl">
                 <Brain size={16} className="text-green-600 shrink-0" />
                 <select
                   value={selectedModel}
                   onChange={(e) => setSelectedModel(e.target.value)}
                   className="flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none"
                 >
                   {nemoConfig.models.map((m) => (
                     <option key={m} value={m}>{m.replace("nvidia/", "")}</option>
                   ))}
                 </select>
               </div>
               <div className="flex items-center gap-4 text-[10px] text-green-700 font-medium ml-2">
                 <span className="flex items-center gap-1"><ShieldCheck size={10} /> Deny-by-default network</span>
                 <span className="flex items-center gap-1"><Shield size={10} /> Capability-restricted</span>
               </div>
             </div>
           )}

           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-2">
                 <div className="flex items-center gap-2 text-blue-600">
                    <Cpu size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest">vCPU</span>
                 </div>
                 {isSelfHosted ? (
                   <select value={selVcpu} onChange={e => setSelVcpu(Number(e.target.value))} className="text-xl font-black text-slate-900 bg-transparent outline-none">
                     {Array.from({ length: platformConfig?.selfhosted?.max_vcpu || 16 }, (_, i) => i + 1).map(v => (
                       <option key={v} value={v}>{v}</option>
                     ))}
                   </select>
                 ) : (
                   <span className="text-xl font-black text-slate-900">{vcpu}</span>
                 )}
                 <span className="text-[10px] text-slate-400 font-medium">cores</span>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-2">
                 <div className="flex items-center gap-2 text-emerald-600">
                    <MemoryStick size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest">RAM</span>
                 </div>
                 {isSelfHosted ? (
                   <select value={selRam} onChange={e => setSelRam(Number(e.target.value))} className="text-xl font-black text-slate-900 bg-transparent outline-none">
                     {[512, 1024, 2048, 4096, 8192, 16384, 32768, 65536].filter(v => v <= (platformConfig?.selfhosted?.max_ram_mb || 32768)).map(v => (
                       <option key={v} value={v}>{v / 1024} GB</option>
                     ))}
                   </select>
                 ) : (
                   <span className="text-xl font-black text-slate-900">{ram / 1024}</span>
                 )}
                 <span className="text-[10px] text-slate-400 font-medium">GB</span>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-2">
                 <div className="flex items-center gap-2 text-purple-600">
                    <HardDrive size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Disk</span>
                 </div>
                 {isSelfHosted ? (
                   <select value={selDisk} onChange={e => setSelDisk(Number(e.target.value))} className="text-xl font-black text-slate-900 bg-transparent outline-none">
                     {[10, 20, 50, 100, 200, 500, 1000].filter(v => v <= (platformConfig?.selfhosted?.max_disk_gb || 500)).map(v => (
                       <option key={v} value={v}>{v}</option>
                     ))}
                   </select>
                 ) : (
                   <span className="text-xl font-black text-slate-900">{disk}</span>
                 )}
                 <span className="text-[10px] text-slate-400 font-medium">GB SSD</span>
              </div>
           </div>

           <button
             onClick={deploy}
             disabled={loading || atLimit || !name.trim()}
             className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 transition-all text-sm font-black text-white px-8 py-5 rounded-2xl shadow-xl shadow-blue-500/30 active:scale-95 disabled:opacity-50 group"
           >
             {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} className="group-hover:scale-125 transition-transform" />}
             {atLimit ? "Agent Limit Reached" : "Confirm & Deploy Agent"}
           </button>
        </div>

        <div className={`flex items-center gap-4 p-8 border rounded-[2rem] ${sandbox === "nemoclaw" ? "bg-green-50 border-green-100" : "bg-blue-50 border-blue-100"}`}>
           {sandbox === "nemoclaw" ? <ShieldCheck size={24} className="text-green-600 flex-shrink-0" /> : <Server size={24} className="text-blue-600 flex-shrink-0" />}
           <p className={`text-xs font-medium leading-relaxed ${sandbox === "nemoclaw" ? "text-green-700" : "text-blue-700"}`}>
             {sandbox === "nemoclaw"
               ? "NemoClaw + OpenClaw agents run in NVIDIA secure sandboxes with deny-by-default networking and capability-restricted containers. Provisioning includes policy setup and model configuration."
               : "OpenClaw + Docker agents are deployed as isolated containers on the LXC cluster. Typical provisioning time is between 45-60 seconds."}
           </p>
        </div>
      </div>
    </Layout>
  );
}
