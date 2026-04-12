import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Server,
  Workflow,
} from "lucide-react";

function formatTimestamp(value) {
  if (!value) return "Not reported";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function renderStateTone(ready) {
  return ready
    ? "bg-emerald-50 text-emerald-700"
    : "bg-amber-50 text-amber-700";
}

export default function HermesStatusPanel({
  runtimeInfo,
  loading,
  error,
  onRefresh,
}) {
  if (loading && !runtimeInfo) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (!runtimeInfo) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-bold text-amber-800">Hermes runtime details unavailable</p>
            <p className="mt-1 text-xs text-amber-700">
              {error || "The Hermes runtime has not reported status yet."}
            </p>
            <button
              onClick={onRefresh}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-amber-300 px-3 py-2 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  const runtimeReady = Boolean(runtimeInfo?.health?.ok);
  const models = Array.isArray(runtimeInfo?.models) ? runtimeInfo.models : [];
  const gateway = runtimeInfo?.gateway || {};
  const platformStates =
    gateway?.platformStates && typeof gateway.platformStates === "object"
      ? Object.entries(gateway.platformStates)
      : [];

  const summaryItems = [
    {
      label: "Runtime State",
      value: runtimeReady ? "Ready" : "Starting",
    },
    {
      label: "Default Model",
      value: runtimeInfo?.defaultModel || "Unavailable",
    },
    {
      label: "Published Models",
      value: String(models.length),
    },
    {
      label: "Gateway State",
      value: gateway?.state || "Unknown",
    },
    {
      label: "Active Agents",
      value: String(gateway?.activeAgents ?? 0),
    },
    {
      label: "Configured Platforms",
      value:
        gateway?.configuredPlatformsCount != null
          ? String(gateway.configuredPlatformsCount)
          : "Unknown",
    },
    {
      label: "Discovered Targets",
      value:
        gateway?.discoveredTargetsCount != null
          ? String(gateway.discoveredTargetsCount)
          : "Unknown",
    },
    {
      label: "Cron Jobs",
      value:
        gateway?.jobsCount != null
          ? String(gateway.jobsCount)
          : "Unknown",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">
            Hermes Status
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            Runtime health, published models, and messaging gateway status in one place.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {runtimeInfo?.url || "Runtime URL unavailable"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${renderStateTone(
              runtimeReady
            )}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                runtimeReady ? "bg-emerald-500" : "animate-pulse bg-amber-500"
              }`}
            />
            {runtimeReady ? "Runtime Ready" : "Runtime Starting"}
          </span>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-bold text-amber-800">Runtime check warning</p>
            <p className="mt-1 text-xs text-amber-700">{error}</p>
          </div>
        </div>
      ) : null}

      {runtimeInfo?.gatewayError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-slate-500" />
          <div>
            <p className="text-sm font-bold text-slate-800">Gateway snapshot unavailable</p>
            <p className="mt-1 text-xs text-slate-600">{runtimeInfo.gatewayError}</p>
          </div>
        </div>
      ) : null}

      {runtimeInfo?.modelsError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-slate-500" />
          <div>
            <p className="text-sm font-bold text-slate-800">Model metadata warning</p>
            <p className="mt-1 text-xs text-slate-600">{runtimeInfo.modelsError}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              {item.label}
            </p>
            <p className="mt-2 text-sm font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Runtime API</p>
            <p className="mt-1 text-xs text-slate-500">
              Hermes exposes an OpenAI-compatible API surface for WebUI and direct requests.
            </p>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Server size={16} className="mt-0.5 shrink-0 text-slate-500" />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  Runtime Endpoint
                </p>
                <p className="mt-1 break-all text-sm font-medium text-slate-800">
                  {runtimeInfo?.url || "Unavailable"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {runtimeInfo?.runtime?.host && runtimeInfo?.runtime?.port
                    ? `${runtimeInfo.runtime.host}:${runtimeInfo.runtime.port}`
                    : "Runtime host unavailable"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <CheckCircle2
                size={16}
                className={`mt-0.5 shrink-0 ${
                  runtimeReady ? "text-emerald-500" : "text-amber-500"
                }`}
              />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  Health Check
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {runtimeReady ? "Healthy" : "Waiting for readiness"}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {runtimeReady
                    ? "Hermes reported a healthy runtime response."
                    : runtimeInfo?.health?.error || "Hermes has not completed startup yet."}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">Published Models</p>
                  <p className="mt-1 text-xs text-slate-500">
                    The current runtime advertises these OpenAI-compatible model ids.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {models.length}
                </span>
              </div>
              {models.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {models.map((model) => (
                    <span
                      key={model.id}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      {model.id}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  No models reported yet. Hermes may still be starting or waiting for upstream auth.
                </p>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-bold text-slate-900">Messaging Gateway</p>
              <p className="mt-1 text-xs text-slate-500">
                Hermes runtime snapshot for cron and communication channels.
              </p>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Workflow size={16} className="mt-0.5 shrink-0 text-slate-500" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                    Last Update
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {formatTimestamp(gateway?.updatedAt || runtimeInfo?.directoryUpdatedAt)}
                  </p>
                </div>
              </div>

              {gateway?.exitReason ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">
                    Exit Reason
                  </p>
                  <p className="mt-1 text-sm text-amber-800">{gateway.exitReason}</p>
                </div>
              ) : null}

              {gateway?.restartRequested ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">
                    Pending Restart
                  </p>
                  <p className="mt-1 text-sm text-sky-800">
                    Hermes requested a runtime restart while applying recent configuration.
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-bold text-slate-900">Platform States</p>
              <p className="mt-1 text-xs text-slate-500">
                Per-platform health as reported by Hermes.
              </p>
            </div>
            <div className="p-4">
              {platformStates.length > 0 ? (
                <div className="space-y-2">
                  {platformStates.map(([platform, state]) => (
                    <div
                      key={platform}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                          {platform}
                        </span>
                        <span className="text-xs font-medium text-slate-700">
                          {state?.state || "unknown"}
                        </span>
                      </div>
                      {state?.error_message ? (
                        <p className="mt-1 text-xs text-rose-600">{state.error_message}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
                  <Bot size={20} className="mx-auto text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    No platform states reported yet
                  </p>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
