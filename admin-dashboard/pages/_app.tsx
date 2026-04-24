import "../styles/globals.css";
import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { ToastProvider } from "../components/Toast";

function AdminAccessGate({ children }) {
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function verifyAdminAccess() {
      // Primary auth is the HttpOnly nora_auth cookie, sent automatically.
      // A legacy localStorage token is forwarded for users still on the
      // pre-cookie session so they don't get kicked out mid-session.
      const legacy = window.localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (legacy) headers["Authorization"] = `Bearer ${legacy}`;

      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
          headers,
        });

        if (response.status === 401) {
          window.localStorage.removeItem("token");
          window.location.replace("/login");
          return;
        }

        if (!response.ok) {
          throw new Error("Cannot verify admin access");
        }

        const user = await response.json();
        if (user.role !== "admin") {
          window.location.replace("/app/dashboard");
          return;
        }

        if (active) {
          setStatus("allowed");
        }
      } catch (accessError) {
        if (active) {
          setStatus("error");
          setError(accessError.message || "Cannot verify admin access");
        }
      }
    }

    verifyAdminAccess();

    return () => {
      active = false;
    };
  }, []);

  if (status === "allowed") {
    return children;
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-300">
            <ShieldAlert size={24} />
          </div>
          <h1 className="text-xl font-black">Admin access check failed</h1>
          <p className="mt-3 text-sm text-slate-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold">
        <Loader2 size={18} className="animate-spin" />
        Checking admin access...
      </div>
    </div>
  );
}

function MyApp({ Component, pageProps }) {
  return (
    <ToastProvider>
      <AdminAccessGate>
        <Component {...pageProps} />
      </AdminAccessGate>
    </ToastProvider>
  );
}

export default MyApp;
