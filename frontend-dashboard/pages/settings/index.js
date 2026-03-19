import { useState, useEffect } from "react";
import Layout from "../../components/layout/Layout";
import LLMSetupWizard from "../../components/agents/LLMSetupWizard";
import { User, Lock, CreditCard, Link2, Trash2, Save, Loader2, ExternalLink, Shield, Key } from "lucide-react";
import { fetchWithAuth } from "../../lib/api";
import { useToast } from "../../components/Toast";

export default function SettingsPage() {
  const [profile, setProfile] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([
      fetchWithAuth("/api/auth/me").then((r) => r.json()),
      fetchWithAuth("/api/billing/subscription").then((r) => r.json()),
    ]).then(([p, s]) => {
      setProfile(p);
      setSubscription(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPwMsg("Passwords do not match");
      return;
    }
    setSaving(true);
    setPwMsg("");
    setPwSuccess(false);
    try {
      const res = await fetchWithAuth("/api/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.new }),
      });
      if (res.ok) {
        setPwMsg("Password updated successfully");
        setPwSuccess(true);
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        const data = await res.json();
        setPwMsg(data.error || "Failed to update password");
      }
    } catch {
      setPwMsg("An error occurred");
    }
    setSaving(false);
  }

  async function handleManageBilling() {
    try {
      const res = await fetchWithAuth("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      toast.error("Could not open billing portal");
    }
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

  const plan = subscription?.plan || "free";
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Settings</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your account, security, and billing.</p>
        </div>

        {/* Profile */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <User size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">Profile</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Email</label>
              <p className="text-sm text-slate-900 mt-1">{profile?.email || "—"}</p>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Role</label>
              <p className="text-sm text-slate-900 mt-1 capitalize">{profile?.role || "user"}</p>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Auth Provider</label>
              <p className="text-sm text-slate-900 mt-1 capitalize">{profile?.provider || "email"}</p>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Member Since</label>
              <p className="text-sm text-slate-900 mt-1">
                {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
        </section>

        {/* Connected Accounts */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Link2 size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">Connected Accounts</h2>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                <span className="text-sm font-medium text-slate-900">Google</span>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${profile?.provider === "google" ? "bg-green-50 text-green-600 border border-green-200" : "bg-slate-100 text-slate-500"}`}>
                {profile?.provider === "google" ? "Connected" : "Not Connected"}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#1e293b"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                <span className="text-sm font-medium text-slate-900">GitHub</span>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${profile?.provider === "github" ? "bg-green-50 text-green-600 border border-green-200" : "bg-slate-100 text-slate-500"}`}>
                {profile?.provider === "github" ? "Connected" : "Not Connected"}
              </span>
            </div>
          </div>
        </section>

        {/* LLM Provider Keys */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Key size={20} className="text-blue-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">LLM Provider Keys</h2>
              <p className="text-xs text-slate-400 mt-0.5">API keys are shared across all your agents. Restart agents after changes.</p>
            </div>
          </div>
          <LLMSetupWizard compact />
        </section>

        {/* Password */}
        {(!profile?.provider || profile.provider === "email") && (
          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <Lock size={20} className="text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">Change Password</h2>
            </div>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <input
                type="password"
                placeholder="Current password"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                value={passwords.current}
                onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="password"
                  placeholder="New password"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                  value={passwords.new}
                  onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                />
              </div>
              {pwMsg && (
                <p className={`text-sm font-medium ${pwSuccess ? "text-green-600" : "text-red-500"}`}>
                  {pwMsg}
                </p>
              )}
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-sm font-bold text-white rounded-xl transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Update Password
              </button>
            </form>
          </section>
        )}

        {/* Billing */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <CreditCard size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">Billing & Plan</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Current Plan</label>
              <p className="text-sm text-slate-900 mt-1 font-bold">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${
                  plan === "enterprise" ? "bg-purple-50 text-purple-600 border border-purple-200" :
                  plan === "pro" ? "bg-blue-50 text-blue-600 border border-blue-200" :
                  "bg-slate-100 text-slate-500"
                }`}>
                  <Shield size={12} />
                  {planLabel}
                </span>
              </p>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Agent Limit</label>
              <p className="text-sm text-slate-900 mt-1">{subscription?.agent_limit || 3}</p>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Resources per Agent</label>
              <p className="text-sm text-slate-900 mt-1">
                {subscription?.vcpu || 2} vCPU / {subscription?.ram_mb ? subscription.ram_mb / 1024 : 2} GB RAM / {subscription?.disk_gb || 20} GB SSD
              </p>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Status</label>
              <p className="text-sm mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  subscription?.status === "active" ? "bg-green-50 text-green-600 border border-green-200" : "bg-yellow-50 text-yellow-600 border border-yellow-200"
                }`}>
                  {subscription?.status || "active"}
                </span>
              </p>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            {plan === "free" && (
              <a
                href="/pricing"
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-sm font-bold text-white rounded-xl transition-all"
              >
                Upgrade Plan
                <ExternalLink size={14} />
              </a>
            )}
            {plan !== "free" && (
              <button
                onClick={handleManageBilling}
                className="flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-sm font-bold text-slate-900 rounded-xl transition-all"
              >
                Manage Billing
                <ExternalLink size={14} />
              </button>
            )}
          </div>
        </section>

        {/* Danger Zone */}
        <section className="bg-red-50 border border-red-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Trash2 size={20} className="text-red-500" />
            <h2 className="text-lg font-bold text-red-600">Danger Zone</h2>
          </div>
          <p className="text-sm text-slate-500">
            Once you delete your account, all your agents and data will be permanently removed. This action cannot be undone.
          </p>
          <button className="px-6 py-3 bg-red-100 text-red-600 hover:bg-red-200 text-sm font-bold rounded-xl transition-all">
            Delete Account
          </button>
        </section>
      </div>
    </Layout>
  );
}
