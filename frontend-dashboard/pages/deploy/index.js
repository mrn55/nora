import Layout from "../../components/layout/Layout";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Rocket,
  Server,
  Boxes,
  Network,
  Shield,
  Loader2,
  CheckCircle2,
  Cpu,
  HardDrive,
  MemoryStick,
  AlertTriangle,
  ShieldCheck,
  Brain,
  KeyRound,
  MessagesSquare,
} from "lucide-react";
import { fetchWithAuth } from "../../lib/api";
import { useToast } from "../../components/Toast";
import {
  activeExecutionTargetFromConfig,
  containerNamePrefixForSelection,
  pickExecutionTargetSelection,
  pickRuntimeFamilySelection,
  runtimeFamilyFromConfig,
  visibleExecutionTargetsFromConfig,
  visibleRuntimeFamiliesFromConfig,
} from "../../lib/runtime";

function slugifyName(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function maturityClasses(maturityTier) {
  switch (maturityTier) {
    case "blocked":
      return "bg-red-50 text-red-700 border-red-200";
    case "experimental":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "beta":
      return "bg-blue-50 text-blue-700 border-blue-200";
    default:
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
}

function MaturityBadge({ maturityTier = "ga", maturityLabel = "GA" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${maturityClasses(
        maturityTier
      )}`}
    >
      {maturityLabel}
    </span>
  );
}

export default function Deploy() {
  const [name, setName] = useState("");
  const [containerName, setContainerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [sub, setSub] = useState(null);
  const [agentCount, setAgentCount] = useState(0);
  const [selectedRuntimeFamily, setSelectedRuntimeFamily] = useState("");
  const [selectedExecutionTarget, setSelectedExecutionTarget] = useState("");
  const [selectedSandboxProfile, setSelectedSandboxProfile] = useState("");
  const [backendConfig, setBackendConfig] = useState(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [platformConfig, setPlatformConfig] = useState(null);
  const [viewerRole, setViewerRole] = useState("user");
  const [selVcpu, setSelVcpu] = useState(1);
  const [selRam, setSelRam] = useState(1024);
  const [selDisk, setSelDisk] = useState(10);
  const resourceDefaultsInitializedRef = useRef(false);
  const resourceSelectionDirtyRef = useRef(false);
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
    fetchWithAuth("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((profile) => setViewerRole(profile?.role || "user"))
      .catch(() => {});
    fetch("/api/config/backends")
      .then((r) => r.json())
      .then(setBackendConfig)
      .catch(() => {});
    fetch("/api/config/platform")
      .then((r) => r.json())
      .then(setPlatformConfig)
      .catch(() => {});
  }, []);

  const deploymentDefaults = platformConfig?.deploymentDefaults || {
    vcpu: 1,
    ram_mb: 1024,
    disk_gb: 10,
  };

  useEffect(() => {
    if (
      !platformConfig?.deploymentDefaults ||
      resourceDefaultsInitializedRef.current ||
      resourceSelectionDirtyRef.current
    ) {
      return;
    }

    setSelVcpu(deploymentDefaults.vcpu);
    setSelRam(deploymentDefaults.ram_mb);
    setSelDisk(deploymentDefaults.disk_gb);
    resourceDefaultsInitializedRef.current = true;
  }, [deploymentDefaults, platformConfig?.deploymentDefaults]);

  const isSelfHosted = platformConfig?.mode !== "paas";
  const plan = sub?.plan || "free";
  const planLabel = isSelfHosted ? "Self-hosted" : plan.charAt(0).toUpperCase() + plan.slice(1);
  const limit = isSelfHosted ? (platformConfig?.selfhosted?.max_agents || 50) : (sub?.agent_limit || 3);
  const atLimit = agentCount >= limit;
  const isAdmin = viewerRole === "admin";
  const defaultRuntimeFamily = useMemo(
    () => runtimeFamilyFromConfig(backendConfig),
    [backendConfig]
  );
  const activeRuntimeFamily = useMemo(
    () => runtimeFamilyFromConfig(backendConfig, selectedRuntimeFamily),
    [backendConfig, selectedRuntimeFamily]
  );
  const visibleRuntimeFamilies = useMemo(
    () => visibleRuntimeFamiliesFromConfig(backendConfig, viewerRole),
    [backendConfig, viewerRole]
  );
  const visibleExecutionTargets = useMemo(
    () =>
      visibleExecutionTargetsFromConfig(
        backendConfig,
        viewerRole,
        activeRuntimeFamily?.id || selectedRuntimeFamily
      ),
    [backendConfig, viewerRole, activeRuntimeFamily?.id, selectedRuntimeFamily]
  );
  const activeExecutionTarget = useMemo(
    () =>
      activeExecutionTargetFromConfig(
        backendConfig,
        activeRuntimeFamily?.id || selectedRuntimeFamily,
        selectedExecutionTarget
      ),
    [backendConfig, activeRuntimeFamily?.id, selectedRuntimeFamily, selectedExecutionTarget]
  );
  const visibleSandboxOptions = useMemo(() => {
    const sandboxProfiles = activeExecutionTarget?.sandboxProfiles || [];
    const enabledProfiles = sandboxProfiles.filter((profile) => profile.enabled);

    return isAdmin
      ? enabledProfiles
      : enabledProfiles.filter((profile) => profile.availableForOnboarding);
  }, [activeExecutionTarget, isAdmin]);
  const activeSandboxOption = useMemo(
    () =>
      (activeExecutionTarget?.sandboxProfiles || []).find(
        (profile) => profile.id === selectedSandboxProfile
      ) || null,
    [activeExecutionTarget, selectedSandboxProfile]
  );
  const ramOptions = useMemo(() => {
    const maxRam = platformConfig?.selfhosted?.max_ram_mb || 32768;
    return Array.from(
      new Set(
        [selRam, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536].filter(
          (value) => value <= maxRam || value === selRam
        )
      )
    ).sort((left, right) => left - right);
  }, [platformConfig?.selfhosted?.max_ram_mb, selRam]);
  const diskOptions = useMemo(() => {
    const maxDisk = platformConfig?.selfhosted?.max_disk_gb || 500;
    return Array.from(
      new Set(
        [selDisk, 10, 20, 50, 100, 200, 500, 1000].filter(
          (value) => value <= maxDisk || value === selDisk
        )
      )
    ).sort((left, right) => left - right);
  }, [platformConfig?.selfhosted?.max_disk_gb, selDisk]);
  const canDeployExecutionTarget = Boolean(activeSandboxOption?.available);
  const isNemoClaw = activeSandboxOption?.id === "nemoclaw";
  const isHermes = activeRuntimeFamily?.id === "hermes";
  const showSandboxSelection = visibleSandboxOptions.length > 1;
  const showRuntimeFamilySelection = visibleRuntimeFamilies.length > 1;
  const suggestedContainerName = useMemo(() => {
    const slug = slugifyName(name);
    const prefix = containerNamePrefixForSelection({
      runtimeFamily:
        activeRuntimeFamily?.id ||
        selectedRuntimeFamily ||
        defaultRuntimeFamily?.id ||
        "openclaw",
      sandboxProfile:
        selectedSandboxProfile ||
        activeSandboxOption?.id ||
        "standard",
    });
    return slug ? `${prefix}-${slug}` : `${prefix}-my-first-agent`;
  }, [
    activeRuntimeFamily?.id,
    activeSandboxOption?.id,
    defaultRuntimeFamily?.id,
    name,
    selectedRuntimeFamily,
    selectedSandboxProfile,
  ]);

  useEffect(() => {
    if (!backendConfig) return;
    const nextRuntimeFamily = pickRuntimeFamilySelection(
      backendConfig,
      viewerRole,
      selectedRuntimeFamily
    );
    if (nextRuntimeFamily && nextRuntimeFamily !== selectedRuntimeFamily) {
      setSelectedRuntimeFamily(nextRuntimeFamily);
    }
  }, [backendConfig, viewerRole, selectedRuntimeFamily]);

  useEffect(() => {
    if (!backendConfig) return;
    const nextTarget = pickExecutionTargetSelection(
      backendConfig,
      viewerRole,
      selectedExecutionTarget,
      activeRuntimeFamily?.id || selectedRuntimeFamily
    );
    if (nextTarget && nextTarget !== selectedExecutionTarget) {
      setSelectedExecutionTarget(nextTarget);
    }
  }, [
    backendConfig,
    viewerRole,
    selectedExecutionTarget,
    activeRuntimeFamily?.id,
    selectedRuntimeFamily,
  ]);

  useEffect(() => {
    const candidateSandboxProfiles = isAdmin
      ? (activeExecutionTarget?.sandboxProfiles || []).filter(
          (profile) => profile.enabled
        )
      : visibleSandboxOptions;
    if (!candidateSandboxProfiles.length) return;

    const current = candidateSandboxProfiles.find(
      (profile) => profile.id === selectedSandboxProfile
    );
    const nextSandboxProfile =
      current ||
      candidateSandboxProfiles.find(
        (profile) => profile.available && profile.isDefault
      ) ||
      candidateSandboxProfiles.find((profile) => profile.available) ||
      candidateSandboxProfiles[0] ||
      null;

    if (
      nextSandboxProfile &&
      nextSandboxProfile.id !== selectedSandboxProfile
    ) {
      setSelectedSandboxProfile(nextSandboxProfile.id);
    }

    if (
      nextSandboxProfile?.id === "nemoclaw" &&
      nextSandboxProfile.defaultModel &&
      !selectedModel
    ) {
      setSelectedModel(nextSandboxProfile.defaultModel);
    }
  }, [
    activeExecutionTarget,
    isAdmin,
    selectedModel,
    selectedSandboxProfile,
    visibleSandboxOptions,
  ]);

  async function deploy() {
    if (atLimit) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/agents/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          runtime_family:
            activeRuntimeFamily?.id ||
            defaultRuntimeFamily?.id ||
            "openclaw",
          deploy_target: selectedExecutionTarget,
          sandbox_profile: selectedSandboxProfile || "standard",
          ...(containerName.trim() ? { container_name: containerName.trim() } : {}),
          ...(isNemoClaw && selectedModel ? { model: selectedModel } : {}),
          ...(isSelfHosted ? { vcpu: selVcpu, ram_mb: selRam, disk_gb: selDisk } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = data?.id ? `/app/agents/${data.id}` : "/app/agents";
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

  const checklist = [
    "Pick a clear operator-friendly agent name.",
    showRuntimeFamilySelection
      ? "Choose the runtime family and execution target that match your workload."
      : "Choose the execution target that matches your infrastructure.",
    "Size CPU, RAM, and disk for the workload.",
    "After deploy, add or sync your LLM provider key if needed.",
    isHermes
      ? "Open logs and terminal to validate the Hermes runtime immediately."
      : "Open chat, logs, and terminal to validate the runtime immediately.",
  ];

  function executionTargetIcon(targetId) {
    switch (targetId) {
      case "k8s":
        return Boxes;
      case "proxmox":
        return Network;
      default:
        return Server;
    }
  }

  function sandboxIcon(profileId) {
    return profileId === "nemoclaw" ? ShieldCheck : Shield;
  }

  return (
    <Layout>
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-8 sm:gap-10">
        <header className="grid lg:grid-cols-[1.3fr,0.9fr] gap-6 items-start">
          <div className="bg-white border border-slate-200 rounded-[2rem] p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <Rocket size={28} strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-none">Deploy New Agent</h1>
                <p className="text-slate-400 font-medium mt-1">
                  {isHermes
                    ? "Provision a new Hermes runtime path to your Nora control plane."
                    : "Provision a new OpenClaw runtime path to your Nora control plane."}
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
              <p className="text-xs font-black uppercase tracking-widest text-blue-700 mb-2">Fast path to activation</p>
              <p className="text-sm text-blue-700/80 leading-relaxed">
                {isHermes
                  ? "The goal of this screen is not just deployment - it is a complete first-run loop. Once the agent is live, finish activation by syncing an LLM provider and validating runtime health, logs, and terminal access."
                  : "The goal of this screen is not just deployment - it is a complete first-run loop. Once the agent is live, finish activation by syncing an LLM provider and validating chat, logs, and terminal access."}
              </p>
            </div>
          </div>

          <div className={`flex flex-col gap-4 p-6 rounded-[2rem] border ${atLimit ? "bg-red-50 border-red-200" : "bg-slate-900 border-slate-800"}`}>
            <div className="flex items-center gap-3">
              {atLimit ? <AlertTriangle size={20} className="text-red-500" /> : <Shield size={20} className="text-blue-400" />}
              <div>
                <p className={`text-sm font-bold ${atLimit ? "text-red-700" : "text-white"}`}>
                  {planLabel} Plan — {agentCount}/{limit} agents used
                </p>
                <p className={`text-xs mt-0.5 ${atLimit ? "text-red-500" : "text-slate-400"}`}>
                  {atLimit
                    ? (isSelfHosted ? "Contact your administrator to increase the limit." : "Upgrade your plan to deploy more agents.")
                    : `${limit - agentCount} deployment slot${limit - agentCount !== 1 ? "s" : ""} remaining.`}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {checklist.slice(0, 3).map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-slate-300">
                  <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="grid xl:grid-cols-[1.4fr,0.8fr] gap-8 items-start">
          <div className="bg-white p-6 sm:p-10 rounded-2xl sm:rounded-[2.5rem] border border-slate-200 shadow-2xl shadow-slate-200/50 flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none ml-2">Agent Name</label>
              <input
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 outline-none transition-all focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500/40 placeholder:text-slate-400"
                placeholder="e.g. customer-support-operator"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-slate-500 ml-2">
                Choose a name other operators will understand at a glance. Example container slug: <span className="font-mono">{suggestedContainerName}</span>
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Runtime Family
                  </p>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600">
                    {activeRuntimeFamily?.contractStatusLabel ||
                      defaultRuntimeFamily?.contractStatusLabel ||
                      "Stable contract"}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-900 mt-2">
                  {activeRuntimeFamily?.label || defaultRuntimeFamily?.label || "OpenClaw"}
                </p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {activeRuntimeFamily?.operatorContractSummary ||
                    "Nora keeps the operator workflow fixed while you choose where the runtime executes and which sandbox profile it uses."}
                </p>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  {activeRuntimeFamily?.expansionPolicy}
                </p>
              </div>
              {showRuntimeFamilySelection ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {visibleRuntimeFamilies.map((family) => {
                    const isSelected = selectedRuntimeFamily === family.id;
                    const isAvailable = family.available;

                    return (
                      <button
                        key={family.id}
                        type="button"
                        onClick={() => {
                          if (isAvailable) setSelectedRuntimeFamily(family.id);
                        }}
                        className={`relative p-5 rounded-2xl border-2 text-left transition-all ${
                          !isAvailable
                            ? "border-slate-200 bg-slate-100 opacity-70 cursor-not-allowed"
                            : isSelected
                              ? "border-blue-500 bg-blue-50"
                              : "border-slate-200 bg-slate-50 hover:border-slate-300"
                        }`}
                        disabled={!isAvailable}
                      >
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <span className="text-sm font-bold text-slate-900">
                            {family.label}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600 border border-slate-200">
                            {family.contractStatusLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          {family.summary}
                        </p>
                        {!isAvailable && family.issue ? (
                          <p className="text-[10px] text-amber-600 font-medium mt-2">
                            {family.issue}
                          </p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none ml-2">
                Container Name <span className="text-slate-300 font-medium normal-case tracking-normal">(optional)</span>
              </label>
              <input
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 font-mono outline-none transition-all focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500/40 placeholder:text-slate-400 placeholder:font-sans"
                placeholder={suggestedContainerName}
                value={containerName}
                onChange={(e) => setContainerName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none ml-2">Execution Target</label>
              <div className={`grid grid-cols-1 ${visibleExecutionTargets.length > 2 ? "md:grid-cols-2" : "md:grid-cols-2"} gap-3`}>
                {visibleExecutionTargets.map((target) => {
                  const Icon = executionTargetIcon(target.id);
                  const isSelected = selectedExecutionTarget === target.id;
                  const isAvailable = target.available;
                  return (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => {
                        if (isAvailable) setSelectedExecutionTarget(target.id);
                      }}
                      className={`relative p-5 rounded-2xl border-2 text-left transition-all ${
                        !isAvailable
                          ? "border-slate-200 bg-slate-100 opacity-70 cursor-not-allowed"
                          : isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300"
                      }`}
                      disabled={!isAvailable}
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="flex items-center gap-2">
                          <Icon
                            size={16}
                            className={!isAvailable ? "text-slate-400" : "text-blue-600"}
                          />
                          <span className="text-sm font-bold text-slate-900">
                            {target.label}
                          </span>
                        </div>
                        <MaturityBadge
                          maturityTier={target.maturityTier}
                          maturityLabel={target.maturityLabel}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        {target.summary}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600 border border-slate-200">
                          {target.runtimeFamilyLabel || "OpenClaw"}
                        </span>
                        {target.supportsSandboxSelection ? (
                          <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600 border border-slate-200">
                            Sandbox choice available
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600 border border-slate-200">
                            {`Sandbox: ${target.defaultSandboxProfile === "nemoclaw" ? "NemoClaw" : "Standard"}`}
                          </span>
                        )}
                      </div>
                      {!isAvailable && target.issue ? (
                        <p className="text-[10px] text-amber-600 font-medium mt-2">{target.issue}</p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {visibleExecutionTargets.length === 0 ? (
                <p className="text-xs text-amber-600 ml-2">
                  {isAdmin
                    ? "No execution targets are enabled for this Nora control plane."
                    : "No onboarding-ready execution targets are enabled for this Nora control plane."}
                </p>
              ) : null}
            </div>

            {showSandboxSelection && (
              <div className="flex flex-col gap-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none ml-2">Sandbox</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {visibleSandboxOptions.map((profile) => {
                    const Icon = sandboxIcon(profile.id);
                    const isSelected = selectedSandboxProfile === profile.id;
                    const isAvailable = profile.available;

                    return (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => {
                          if (isAvailable) setSelectedSandboxProfile(profile.id);
                        }}
                        className={`relative p-5 rounded-2xl border-2 text-left transition-all ${
                          !isAvailable
                            ? "border-slate-200 bg-slate-100 opacity-70 cursor-not-allowed"
                            : isSelected
                              ? profile.id === "nemoclaw"
                                ? "border-green-500 bg-green-50"
                                : "border-blue-500 bg-blue-50"
                              : "border-slate-200 bg-slate-50 hover:border-slate-300"
                        }`}
                        disabled={!isAvailable}
                      >
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="flex items-center gap-2">
                            <Icon
                              size={16}
                              className={
                                !isAvailable
                                  ? "text-slate-400"
                                  : profile.id === "nemoclaw"
                                    ? "text-green-600"
                                    : "text-blue-600"
                              }
                            />
                            <span className="text-sm font-bold text-slate-900">
                              {profile.label}
                            </span>
                          </div>
                          <MaturityBadge
                            maturityTier={profile.maturityTier}
                            maturityLabel={profile.maturityLabel}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          {profile.summary}
                        </p>
                        {!isAvailable && profile.issue ? (
                          <p className="text-[10px] text-amber-600 font-medium mt-2">
                            {profile.issue}
                          </p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isNemoClaw && activeSandboxOption?.models?.length > 0 && (
              <div className="flex flex-col gap-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none ml-2">Nemotron Model</label>
                <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-2xl">
                  <Brain size={16} className="text-green-600 shrink-0" />
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none"
                  >
                    {activeSandboxOption.models.map((model) => (
                      <option key={model} value={model}>{model.replace("nvidia/", "")}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-green-700 font-medium ml-2 flex-wrap">
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
                  <select
                    value={selVcpu}
                    onChange={(e) => {
                      resourceSelectionDirtyRef.current = true;
                      setSelVcpu(Number(e.target.value));
                    }}
                    className="text-xl font-black text-slate-900 bg-transparent outline-none"
                  >
                    {Array.from({ length: platformConfig?.selfhosted?.max_vcpu || 16 }, (_, i) => i + 1).map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xl font-black text-slate-900">
                    {sub?.vcpu || deploymentDefaults.vcpu}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-medium">cores</span>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-emerald-600">
                  <MemoryStick size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">RAM</span>
                </div>
                {isSelfHosted ? (
                  <select
                    value={selRam}
                    onChange={(e) => {
                      resourceSelectionDirtyRef.current = true;
                      setSelRam(Number(e.target.value));
                    }}
                    className="text-xl font-black text-slate-900 bg-transparent outline-none"
                  >
                    {ramOptions.map((value) => (
                      <option key={value} value={value}>
                        {value >= 1024 ? `${value / 1024} GB` : `${value} MB`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xl font-black text-slate-900">
                    {(sub?.ram_mb || deploymentDefaults.ram_mb) / 1024}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-medium">GB</span>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-purple-600">
                  <HardDrive size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Disk</span>
                </div>
                {isSelfHosted ? (
                  <select
                    value={selDisk}
                    onChange={(e) => {
                      resourceSelectionDirtyRef.current = true;
                      setSelDisk(Number(e.target.value));
                    }}
                    className="text-xl font-black text-slate-900 bg-transparent outline-none"
                  >
                    {diskOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xl font-black text-slate-900">
                    {sub?.disk_gb || deploymentDefaults.disk_gb}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-medium">GB SSD</span>
              </div>
            </div>

            <button
              onClick={deploy}
              disabled={loading || atLimit || !name.trim() || !canDeployExecutionTarget}
              className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 transition-all text-sm font-black text-white px-8 py-5 rounded-2xl shadow-xl shadow-blue-500/30 active:scale-95 disabled:opacity-50 group"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} className="group-hover:scale-125 transition-transform" />}
              {atLimit
                ? "Agent Limit Reached"
                : !canDeployExecutionTarget
                  ? "Selected Runtime Path Unavailable"
                  : "Deploy Agent & Open Validation"}
            </button>
          </div>

          <div className="flex flex-col gap-6">
            <div className={`flex items-start gap-4 p-6 border rounded-[2rem] ${isNemoClaw ? "bg-green-50 border-green-100" : isHermes ? "bg-cyan-50 border-cyan-100" : "bg-blue-50 border-blue-100"}`}>
              {isNemoClaw ? <ShieldCheck size={24} className="text-green-600 flex-shrink-0" /> : <Server size={24} className={`${isHermes ? "text-cyan-600" : "text-blue-600"} flex-shrink-0`} />}
              <div>
                <p className={`text-xs font-black uppercase tracking-widest mb-2 ${isNemoClaw ? "text-green-700" : isHermes ? "text-cyan-700" : "text-blue-700"}`}>
                  Runtime Path Summary
                </p>
                <p className={`text-sm font-medium leading-relaxed ${isNemoClaw ? "text-green-700" : isHermes ? "text-cyan-700" : "text-blue-700"}`}>
                  {activeSandboxOption?.detail ||
                    activeExecutionTarget?.detail ||
                    "Select an enabled execution target to see the runtime summary."}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className={`text-xs font-bold ${isNemoClaw ? "text-green-700/80" : isHermes ? "text-cyan-700/80" : "text-blue-700/80"}`}>
                    {(activeExecutionTarget?.runtimeFamilyLabel || activeRuntimeFamily?.label || defaultRuntimeFamily?.label || "OpenClaw") +
                      " runtime" +
                      " • " +
                      (activeExecutionTarget?.label || "Docker") +
                      " target" +
                      " • " +
                      ((activeSandboxOption?.label || "Standard") + " sandbox")}
                  </span>
                  <MaturityBadge
                    maturityTier={activeSandboxOption?.maturityTier || activeExecutionTarget?.maturityTier}
                    maturityLabel={activeSandboxOption?.maturityLabel || activeExecutionTarget?.maturityLabel}
                  />
                </div>
                {isAdmin && activeExecutionTarget?.maturityTier === "blocked" ? (
                  <p className="text-[11px] text-red-700 mt-2 leading-relaxed">
                    Blocked targets stay visible to admins for release awareness, but they remain disabled for onboarding and deployment.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">What happens next</p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <KeyRound size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">1. Verify provider keys</p>
                    <p className="text-sm text-slate-500 leading-relaxed">If your agent needs model access, add or sync an LLM provider in Settings before deeper testing.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <MessagesSquare size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">2. Validate the runtime</p>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      {isHermes
                        ? "After deploy, Nora sends you straight to the new agent so you can verify runtime health, logs, and terminal access without hunting for the next screen."
                        : "After deploy, Nora sends you straight to the new agent so you can verify chat, logs, and terminal without hunting for the next screen."}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <Shield size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">3. Move into operations</p>
                    <p className="text-sm text-slate-500 leading-relaxed">Once the first agent is healthy, use Nora for channels, integrations, scheduling, and broader fleet management.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Operator checklist</p>
              <div className="space-y-3">
                {checklist.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-slate-300">
                    <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
