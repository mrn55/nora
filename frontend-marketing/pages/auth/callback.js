import { useEffect } from "react";
import { useSession } from "next-auth/react";

// Bridge page: extracts the platform JWT from NextAuth session,
// stores it in localStorage so the dashboard's fetchWithAuth() works,
// then redirects to the dashboard.
export default function AuthCallback() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;

    if (session?.accessToken) {
      localStorage.setItem("token", session.accessToken);
      window.location.href = "/app/dashboard";
    } else {
      // No session — redirect to login
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
