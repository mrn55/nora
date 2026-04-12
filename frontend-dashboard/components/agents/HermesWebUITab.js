import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { fetchWithAuth } from "../../lib/api";

const STATUS_POLL_MS = 5000;

function formatMessageTime(value) {
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function HermesWebUITab({ agentId, agentStatus }) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [runtimeInfo, setRuntimeInfo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const messageListRef = useRef(null);
  const pollRef = useRef(null);
  const cancelledRef = useRef(false);

  const runtimeReady = Boolean(runtimeInfo?.health?.ok);
  const defaultModel =
    runtimeInfo?.defaultModel || runtimeInfo?.models?.[0]?.id || null;

  function clearStatusPoll() {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }

  async function loadRuntimeInfo({ showSpinner = true } = {}) {
    clearStatusPoll();
    if (showSpinner) {
      setLoading(true);
    }
    setError("");

    try {
      const res = await fetchWithAuth(`/api/agents/${agentId}/hermes-ui`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load Hermes WebUI");
      }

      if (cancelledRef.current) return;
      setRuntimeInfo(data);

      if (
        !data.health?.ok &&
        (agentStatus === "running" || agentStatus === "warning")
      ) {
        pollRef.current = window.setTimeout(() => {
          loadRuntimeInfo({ showSpinner: false });
        }, STATUS_POLL_MS);
      }
    } catch (nextError) {
      if (cancelledRef.current) return;
      setError(nextError.message || "Failed to load Hermes WebUI");
      if (agentStatus === "running" || agentStatus === "warning") {
        pollRef.current = window.setTimeout(() => {
          loadRuntimeInfo({ showSpinner: false });
        }, STATUS_POLL_MS);
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    cancelledRef.current = false;
    if (agentId && (agentStatus === "running" || agentStatus === "warning")) {
      loadRuntimeInfo();
    } else {
      setLoading(false);
      setRuntimeInfo(null);
      setError("");
      clearStatusPoll();
    }

    return () => {
      cancelledRef.current = true;
      clearStatusPoll();
    };
  }, [agentId, agentStatus]);

  useEffect(() => {
    if (!messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [messages, sending]);

  async function handleSend() {
    const content = draft.trim();
    if (!content || sending || !runtimeReady) return;

    const nextUserMessage = {
      id: `user-${Date.now().toString(36)}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, nextUserMessage];

    setMessages(nextMessages);
    setDraft("");
    setSending(true);
    setError("");

    try {
      const res = await fetchWithAuth(`/api/agents/${agentId}/hermes-ui/chat`, {
        method: "POST",
        body: JSON.stringify({
          ...(defaultModel ? { model: defaultModel } : {}),
          ...(sessionId ? { sessionId } : {}),
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Hermes chat request failed");
      }

      if (cancelledRef.current) return;
      setSessionId(data.sessionId || "");
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now().toString(36)}`,
          role: "assistant",
          content: data.message || "(No response returned)",
          usage: data.usage || null,
          model: data.model || defaultModel || null,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (nextError) {
      if (cancelledRef.current) return;
      setMessages((current) =>
        current.filter((message) => message.id !== nextUserMessage.id)
      );
      setDraft(content);
      setError(nextError.message || "Hermes chat request failed");
    } finally {
      if (!cancelledRef.current) {
        setSending(false);
      }
    }
  }

  function handleComposerKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    handleSend();
  }

  function resetConversation() {
    setMessages([]);
    setSessionId("");
    setError("");
  }

  if (agentStatus !== "running" && agentStatus !== "warning") {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
        <Bot size={32} className="text-slate-400" />
        <p className="text-sm text-slate-500 font-medium">
          Hermes WebUI available when agent is{" "}
          <span className="text-green-500 font-bold">running</span>
        </p>
        <p className="text-xs text-slate-400">
          Agent is currently <span className="font-bold">{agentStatus}</span>
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4"
      style={{ height: "calc(100vh - 260px)", minHeight: "560px" }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">
            Hermes WebUI
          </p>
          <p className="text-sm font-bold text-slate-900 mt-1">
            Nora-native chat backed by Hermes&apos;s OpenAI-compatible runtime API
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {runtimeInfo?.url || "Runtime URL unavailable"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
              runtimeReady
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                runtimeReady ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
              }`}
            />
            {runtimeReady ? "Ready" : "Starting"}
          </span>
          <button
            onClick={() => loadRuntimeInfo()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] flex-1 min-h-0">
        <section className="min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Conversation</p>
              <p className="text-xs text-slate-500 mt-1">
                {runtimeReady
                  ? "Send prompts directly to the Hermes runtime."
                  : runtimeInfo?.health?.error ||
                    "Waiting for Hermes to finish starting."}
              </p>
            </div>
            <button
              onClick={resetConversation}
              disabled={!messages.length && !sessionId}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={12} />
              Reset
            </button>
          </div>

          <div
            ref={messageListRef}
            className="flex-1 overflow-y-auto bg-slate-50/70 px-4 py-4 space-y-4"
          >
            {!messages.length ? (
              <div className="h-full min-h-[280px] flex items-center justify-center text-center px-6">
                <div className="max-w-md space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Bot size={22} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Hermes chat is ready from this page
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      Start with a concrete operator task, then watch logs and terminal beside it if the agent needs deeper inspection.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                      isUser
                        ? "bg-blue-600 text-white"
                        : "bg-white border border-slate-200 text-slate-800"
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {message.content}
                    </div>
                    <div
                      className={`mt-2 flex items-center gap-2 text-[11px] ${
                        isUser ? "text-blue-100" : "text-slate-400"
                      }`}
                    >
                      <span>{formatMessageTime(message.createdAt)}</span>
                      {message.usage?.total_tokens ? (
                        <span>{message.usage.total_tokens} tokens</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}

            {sending ? (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Loader2 size={14} className="animate-spin text-blue-500" />
                    Hermes is working on the request...
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-white p-4 space-y-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={
                runtimeReady
                  ? "Ask Hermes to inspect, change, or explain something..."
                  : "Wait for Hermes to finish starting before sending chat requests."
              }
              rows={4}
              disabled={!runtimeReady || sending}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-slate-50 disabled:text-slate-400"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                {runtimeReady
                  ? "Session continuity stays attached to this tab until you reset the conversation."
                  : runtimeInfo?.health?.error ||
                    "Hermes runtime is still starting. The tab will retry automatically."}
              </p>
              <button
                onClick={handleSend}
                disabled={!draft.trim() || !runtimeReady || sending}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Send
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Runtime
              </p>
              <p className="text-sm font-bold text-slate-900 mt-1">
                {runtimeInfo?.runtime?.host || "Unknown host"}:
                {runtimeInfo?.runtime?.port || "8642"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Advertised Model
              </p>
              <p className="text-sm font-mono text-slate-900 mt-1 break-all">
                {defaultModel || "Awaiting model metadata"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Session
              </p>
              <p className="text-sm font-mono text-slate-900 mt-1 break-all">
                {sessionId || "Starts on first reply"}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                What This Uses
              </p>
              <p className="text-sm text-slate-600 mt-1">
                Nora proxies Hermes&apos;s `/v1/chat/completions`, keeps the runtime auth key server-side, and reuses the Hermes session id for continuity.
              </p>
            </div>
            {!runtimeReady ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-sm font-bold text-amber-800">
                  Runtime still starting
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Fresh Hermes deploys may need extra time before the API server begins answering chat and model requests.
                </p>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
