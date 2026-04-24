import { useEffect } from "react";
import { useSession } from "next-auth/react";

// Bridge page: after NextAuth finishes OAuth (or Credentials) and places the
// platform JWT on the session, we hand that token to the backend over a
// same-origin POST so it can set the HttpOnly nora_auth cookie on the user's
// browser. From that point on, all API calls authenticate via the cookie and
// the JWT never touches localStorage.
export default function AuthCallback() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    const accessToken = (session as any)?.accessToken;

    async function routeAfterLogin() {
      try {
        const [providersRes, agentsRes] = await Promise.all([
          fetch("/api/llm-providers", { credentials: "include" }),
          fetch("/api/agents", { credentials: "include" }),
        ]);

        const [providers, agents] = await Promise.all([
          providersRes.ok ? providersRes.json() : [],
          agentsRes.ok ? agentsRes.json() : [],
        ]);

        const hasProviders = Array.isArray(providers) && providers.length > 0;
        const hasAgents = Array.isArray(agents) && agents.length > 0;

        window.location.href = hasProviders || hasAgents ? "/app/dashboard" : "/app/getting-started";
      } catch {
        window.location.href = "/app/dashboard";
      }
    }

    async function upgradeToCookie(token: string) {
      try {
        const res = await fetch("/api/auth/session-upgrade", {
          method: "POST",
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
        // Regardless of the cookie upgrade result, clear any legacy token so
        // we don't leave the JWT lingering in localStorage.
        localStorage.removeItem("token");
        if (!res.ok) {
          // Cookie upgrade failed — send the user back to login so they can
          // retry cleanly rather than limping along with no usable session.
          window.location.href = "/login";
          return;
        }
        await routeAfterLogin();
      } catch {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
    }

    if (accessToken) {
      upgradeToCookie(accessToken);
    } else {
      window.location.href = "/login";
    }
  }, [session, status]);

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-slate-400 font-medium">Signing you in...</p>
      </div>
    </div>
  );
}
