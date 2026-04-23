import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { Loader2, RefreshCw, Search, Shield, Trash2, Users } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import MetricCard from "../components/MetricCard";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { fetchWithAuth } from "../lib/api";
import { formatCount, formatDate } from "../lib/format";

function matchesUser(user, search) {
  if (!search) return true;
  const needle = search.toLowerCase();
  return (
    user.email?.toLowerCase().includes(needle) ||
    user.name?.toLowerCase().includes(needle) ||
    user.id?.toLowerCase().includes(needle)
  );
}

function formatPlanLabel(plan) {
  const normalized = String(plan || "free")
    .trim()
    .toLowerCase();
  if (normalized === "selfhosted") return "Self-hosted";
  if (!normalized) return "Free";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatAgentCap(user) {
  if (user?.is_unlimited) return "Unlimited";
  if (Number.isInteger(user?.agent_limit)) return formatCount(user.agent_limit);
  return "—";
}

function formatAgentCapSource(source) {
  switch (source) {
    case "admin_override":
      return "Admin override";
    case "admin_default_unlimited":
      return "Admin default";
    case "default":
    default:
      return "Default user cap";
  }
}

function formatDefaultAgentCap(user) {
  if (user?.role === "admin") return "Unlimited";
  if (Number.isInteger(user?.base_agent_limit)) {
    return formatCount(user.base_agent_limit);
  }
  return "—";
}

function describeDefaultAgentCap(user) {
  if (user?.role === "admin") {
    return "Leave blank to restore the admin default of unlimited.";
  }
  if (Number.isInteger(user?.base_agent_limit)) {
    return `Leave blank to use the default cap of ${formatCount(user.base_agent_limit)}.`;
  }
  return "Leave blank to use the default cap.";
}

function buildLimitDrafts(users = []) {
  return Object.fromEntries(
    users.map((user) => [
      user.id,
      user.agent_limit_override == null ? "" : String(user.agent_limit_override),
    ]),
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [roleLoadingId, setRoleLoadingId] = useState("");
  const [deleteLoadingId, setDeleteLoadingId] = useState("");
  const [limitDrafts, setLimitDrafts] = useState({});
  const [limitLoadingId, setLimitLoadingId] = useState("");
  const deferredSearch = useDeferredValue(search);
  const toast = useToast();

  const loadUsers = useCallback(async () => {
    try {
      const response = await fetchWithAuth("/api/admin/users");
      if (!response.ok) {
        throw new Error("Failed to load users");
      }

      const data = await response.json();
      const rows = Array.isArray(data) ? data : [];
      setUsers(rows);
      setLimitDrafts(buildLimitDrafts(rows));
    } catch (error) {
      console.error("Failed to load admin users:", error);
      toast.error(error.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function changeRole(userId, nextRole) {
    setRoleLoadingId(userId);
    try {
      const response = await fetchWithAuth(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update role");
      }

      setUsers((current) =>
        current.map((user) => (user.id === userId ? { ...user, role: payload.role } : user)),
      );
      toast.success("Role updated");
    } catch (error) {
      console.error("Failed to update admin role:", error);
      toast.error(error.message || "Failed to update role");
      loadUsers();
    } finally {
      setRoleLoadingId("");
    }
  }

  async function deleteUser(user) {
    const label = user.email || user.id;
    if (
      !window.confirm(`Delete ${label}? This will remove the account and clean up owned agents.`)
    ) {
      return;
    }

    setDeleteLoadingId(user.id);
    try {
      const response = await fetchWithAuth(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete user");
      }

      setUsers((current) => current.filter((entry) => entry.id !== user.id));
      setLimitDrafts((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
      toast.success("User deleted");
    } catch (error) {
      console.error("Failed to delete admin user:", error);
      toast.error(error.message || "Failed to delete user");
    } finally {
      setDeleteLoadingId("");
    }
  }

  async function updateAgentLimit(user, nextOverride) {
    setLimitLoadingId(user.id);
    try {
      const response = await fetchWithAuth(`/api/admin/users/${user.id}/agent-limit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_limit_override: nextOverride }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update agent cap");
      }

      setUsers((current) => current.map((entry) => (entry.id === user.id ? payload : entry)));
      setLimitDrafts((current) => ({
        ...current,
        [user.id]: payload.agent_limit_override == null ? "" : String(payload.agent_limit_override),
      }));
      toast.success(nextOverride == null ? "Agent cap override cleared" : "Agent cap updated");
    } catch (error) {
      console.error("Failed to update agent cap:", error);
      toast.error(error.message || "Failed to update agent cap");
      loadUsers();
    } finally {
      setLimitLoadingId("");
    }
  }

  async function saveAgentLimit(user) {
    const rawValue = String(limitDrafts[user.id] || "").trim();
    if (!rawValue) {
      toast.error("Enter an agent cap or clear the override");
      return;
    }

    const nextOverride = Number(rawValue);
    if (!Number.isSafeInteger(nextOverride) || nextOverride < 0) {
      toast.error("Agent cap must be a whole number that is 0 or greater");
      return;
    }

    await updateAgentLimit(user, nextOverride);
  }

  async function clearAgentLimit(user) {
    await updateAgentLimit(user, null);
  }

  const adminCount = users.filter((user) => user.role === "admin").length;
  const filteredUsers = users.filter((user) => {
    if (roleFilter !== "all" && user.role !== roleFilter) return false;
    return matchesUser(user, deferredSearch);
  });

  const totalAgentCount = users.reduce((sum, user) => sum + (Number(user.agentCount) || 0), 0);

  return (
    <AdminLayout>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-red-500">
              User Admin
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              Accounts and roles
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
              Search the user base, adjust admin privileges, and cleanly remove accounts that own
              agent infrastructure.
            </p>
          </div>

          <button
            onClick={() => {
              setLoading(true);
              loadUsers();
            }}
            className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </header>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Users"
            value={formatCount(users.length)}
            icon={Users}
            tone="blue"
            caption="All registered accounts"
          />
          <MetricCard
            label="Admins"
            value={formatCount(adminCount)}
            icon={Shield}
            tone="red"
            caption="Full-admin staff accounts"
          />
          <MetricCard
            label="Standard Users"
            value={formatCount(users.length - adminCount)}
            icon={Users}
            tone="emerald"
            caption="Non-admin customer accounts"
          />
          <MetricCard
            label="Owned Agents"
            value={formatCount(totalAgentCount)}
            icon={RefreshCw}
            tone="purple"
            caption="Agents attached to user accounts"
          />
        </div>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative max-w-xl flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by email, name, or user id"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition-colors focus:border-red-200 focus:bg-white"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-red-200 focus:bg-white"
            >
              <option value="all">All roles</option>
              <option value="admin">Admins</option>
              <option value="user">Users</option>
            </select>
          </div>

          <div className="mt-6 overflow-x-auto">
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 size={28} className="animate-spin text-red-500" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 text-sm font-medium text-slate-400">
                No users match the current filters.
              </div>
            ) : (
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-2 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      User
                    </th>
                    <th className="px-2 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Role
                    </th>
                    <th className="px-2 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Agents
                    </th>
                    <th className="px-2 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Agent Cap
                    </th>
                    <th className="px-2 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Created
                    </th>
                    <th className="px-2 py-3 text-right text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const isLastAdmin = user.role === "admin" && adminCount <= 1;
                    const limitDraft = String(limitDrafts[user.id] || "");
                    const currentLimitDraft =
                      user.agent_limit_override == null ? "" : String(user.agent_limit_override);
                    const limitDraftDirty = limitDraft !== currentLimitDraft;
                    const parsedLimitDraft = limitDraft.trim() === "" ? null : Number(limitDraft);
                    const canSaveLimit =
                      limitDraftDirty &&
                      limitDraft.trim() !== "" &&
                      Number.isSafeInteger(parsedLimitDraft) &&
                      parsedLimitDraft >= 0;
                    return (
                      <tr key={user.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-2 py-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">
                              {user.name || user.email}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">{user.email}</p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-400">
                              {user.id.slice(0, 8)}
                            </p>
                          </div>
                        </td>
                        <td className="px-2 py-4">
                          <div className="flex items-center gap-3">
                            <StatusBadge status={user.role === "admin" ? "active" : "inactive"} />
                            <select
                              value={user.role}
                              disabled={roleLoadingId === user.id || isLastAdmin}
                              onChange={(event) => changeRole(user.id, event.target.value)}
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-red-200 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <option value="user">user</option>
                              <option value="admin">admin</option>
                            </select>
                          </div>
                          {isLastAdmin ? (
                            <p className="mt-2 text-[11px] font-semibold text-orange-600">
                              Last admin cannot be demoted.
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-4">
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
                            {formatCount(user.agentCount)}
                          </span>
                        </td>
                        <td className="px-2 py-4">
                          <div className="min-w-[16rem]">
                            <p className="text-sm font-semibold text-slate-950">
                              {formatAgentCap(user)}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-400">
                              {formatAgentCapSource(user.agent_limit_source)} ·{" "}
                              {formatPlanLabel(user.plan)}
                            </p>
                            {user.agent_limit_source === "admin_override" ? (
                              <p className="mt-1 text-[11px] font-medium text-slate-500">
                                Default cap: {formatDefaultAgentCap(user)}
                              </p>
                            ) : null}

                            <div className="mt-3 flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={limitDraft}
                                onChange={(event) =>
                                  setLimitDrafts((current) => ({
                                    ...current,
                                    [user.id]: event.target.value,
                                  }))
                                }
                                placeholder={
                                  user.role === "admin" ? "Unlimited default" : "Use default"
                                }
                                className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-red-200 focus:bg-white"
                              />
                              <button
                                disabled={!canSaveLimit || limitLoadingId === user.id}
                                onClick={() => saveAgentLimit(user)}
                                className="inline-flex min-w-[4.5rem] items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {limitLoadingId === user.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  "Save"
                                )}
                              </button>
                              {user.agent_limit_override != null ? (
                                <button
                                  disabled={limitLoadingId === user.id}
                                  onClick={() => clearAgentLimit(user)}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Clear
                                </button>
                              ) : null}
                            </div>

                            <p className="mt-2 text-[11px] font-medium text-slate-500">
                              {describeDefaultAgentCap(user)}
                            </p>
                          </div>
                        </td>
                        <td className="px-2 py-4 text-sm font-medium text-slate-500">
                          {formatDate(user.created_at)}
                        </td>
                        <td className="px-2 py-4 text-right">
                          <button
                            disabled={deleteLoadingId === user.id || isLastAdmin}
                            onClick={() => deleteUser(user)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-red-100 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deleteLoadingId === user.id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
