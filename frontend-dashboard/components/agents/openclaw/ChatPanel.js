import { useState, useRef, useEffect, useCallback } from "react";
import { fetchWithAuth } from "../../../lib/api";
import {
  Send, Loader2, Bot, User, Wrench, Brain, Trash2, StopCircle, AlertTriangle,
} from "lucide-react";
import LLMSetupWizard from "../LLMSetupWizard";

/**
 * Full interactive chat panel with streaming, tool visualization, and thinking traces.
 * Uses the OpenAI-compatible /v1/chat/completions endpoint via our gateway proxy.
 */
export default function ChatPanel({ agentId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [hasProviders, setHasProviders] = useState(null); // null=loading, true/false
  const [showSetup, setShowSetup] = useState(false);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  // Check if user has LLM providers configured
  useEffect(() => {
    fetchWithAuth("/api/llm-providers")
      .then((r) => r.json())
      .then((data) => {
        const has = Array.isArray(data) && data.length > 0;
        setHasProviders(has);
        if (!has) setShowSetup(true);
      })
      .catch(() => setHasProviders(false));
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg = { role: "user", content: text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    // Build conversation history for the API
    const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));

    // Create an assistant placeholder for streaming
    const assistantId = Date.now();
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", ts: assistantId, streaming: true, toolCalls: [], thinking: "" },
    ]);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetchWithAuth(`/api/agents/${agentId}/gateway/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          stream: true,
          ...(sessionId ? { session_id: sessionId } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Chat request failed" }));
        setMessages((prev) =>
          prev.map((m) =>
            m.ts === assistantId
              ? { ...m, content: `Error: ${err.error || err.details || "Unknown error"}`, streaming: false }
              : m
          )
        );
        setSending(false);
        return;
      }

      // Stream SSE response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const chunk = JSON.parse(data);

            // Handle final done marker from proxy
            if (chunk.type === "done") {
              // Capture session key from response if available
              const sid = chunk.result?.sessionKey || chunk.result?.session_id || chunk.sessionKey;
              if (sid) setSessionId(sid);
              continue;
            }
            // Handle error from proxy
            if (chunk.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.ts === assistantId
                    ? { ...m, content: m.content || `Error: ${chunk.error}`, streaming: false }
                    : m
                )
              );
              continue;
            }

            // Gateway chat/agent events carry content in various shapes
            // Try OpenAI-compat delta first, then raw payload text
            const delta = chunk.choices?.[0]?.delta;
            const text = delta?.content || chunk.text || chunk.content || chunk.message || "";
            const toolCalls = delta?.tool_calls || chunk.tool_calls;
            const thinking = delta?.reasoning || delta?.thinking || chunk.thinking || "";

            setMessages((prev) =>
              prev.map((m) => {
                if (m.ts !== assistantId) return m;
                const updated = { ...m };

                if (text) {
                  updated.content += text;
                }

                if (toolCalls) {
                  const newToolCalls = [...(updated.toolCalls || [])];
                  for (const tc of toolCalls) {
                    const idx = tc.index !== undefined ? tc.index : newToolCalls.length;
                    if (!newToolCalls[idx]) {
                      newToolCalls[idx] = {
                        id: tc.id || "",
                        type: tc.type || "function",
                        function: { name: "", arguments: "" },
                      };
                    }
                    if (tc.function?.name) newToolCalls[idx].function.name += tc.function.name;
                    if (tc.function?.arguments) newToolCalls[idx].function.arguments += tc.function.arguments;
                  }
                  updated.toolCalls = newToolCalls;
                }

                if (thinking) {
                  updated.thinking = (updated.thinking || "") + thinking;
                }

                return updated;
              })
            );
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }

      // Mark streaming complete
      setMessages((prev) =>
        prev.map((m) => (m.ts === assistantId ? { ...m, streaming: false } : m))
      );
    } catch (err) {
      if (err.name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.ts === assistantId
              ? { ...m, content: `Error: ${err.message}`, streaming: false }
              : m
          )
        );
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [input, sending, messages, agentId, sessionId]);

  function handleStop() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }

  function handleClear() {
    setMessages([]);
    setSessionId(null);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Show setup wizard if no providers
  if (showSetup && hasProviders === false) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 w-full" style={{ minHeight: "350px" }}>
        <LLMSetupWizard onComplete={() => { setShowSetup(false); setHasProviders(true); }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden w-full" style={{ height: "calc(100vh - 20rem)", minHeight: "350px", maxHeight: "calc(100vh - 12rem)" }}>
      {/* No-provider banner */}
      {hasProviders === false && !showSetup && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
          <AlertTriangle size={12} />
          <span>No LLM provider configured.</span>
          <button onClick={() => setShowSetup(true)} className="font-bold text-amber-800 underline hover:text-amber-900">Set up now</button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <Bot size={14} />
          Chat
          {sessionId && (
            <span className="text-[10px] font-mono text-slate-400 ml-2">
              session: {sessionId.slice(0, 8)}
            </span>
          )}
        </div>
        <button
          onClick={handleClear}
          className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
        >
          <Trash2 size={11} />
          Clear
        </button>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <Bot size={40} className="opacity-30" />
            <p className="text-sm font-medium">Send a message to start chatting with your agent</p>
            <p className="text-xs text-slate-300">
              Uses the OpenClaw Gateway&apos;s OpenAI-compatible API
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
            style={{ minHeight: "38px", maxHeight: "120px" }}
            onInput={(e) => {
              e.target.style.height = "38px";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
          />
          {sending ? (
            <button
              onClick={handleStop}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              <StopCircle size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble Component ─────────────────────────────────────

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const [showThinking, setShowThinking] = useState(false);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
          isUser ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-600"
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Content */}
      <div className={`flex-1 ${isUser ? "text-right" : ""} max-w-[80%]`}>
        {/* Thinking trace */}
        {message.thinking && (
          <div className="mb-1">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="text-[10px] text-purple-500 hover:text-purple-700 flex items-center gap-1 font-medium transition-colors"
            >
              <Brain size={10} />
              {showThinking ? "Hide" : "Show"} thinking
            </button>
            {showThinking && (
              <div className="mt-1 p-2 bg-purple-50 border border-purple-100 rounded-lg text-xs text-purple-700 whitespace-pre-wrap font-mono">
                {message.thinking}
              </div>
            )}
          </div>
        )}

        {/* Tool calls */}
        {message.toolCalls?.length > 0 && (
          <div className="mb-2 space-y-1">
            {message.toolCalls.map((tc, idx) => (
              <div
                key={idx}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700 font-mono"
              >
                <Wrench size={10} />
                <span className="font-bold">{tc.function?.name || "tool"}</span>
                {tc.function?.arguments && (
                  <span className="text-amber-500 max-w-[200px] truncate">
                    ({tc.function.arguments.slice(0, 60)}
                    {tc.function.arguments.length > 60 ? "…" : ""})
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Message content */}
        <div
          className={`inline-block px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
            isUser
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-800"
          }`}
        >
          {message.content}
          {message.streaming && (
            <span className="inline-block ml-1">
              <Loader2 size={12} className="animate-spin inline" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
