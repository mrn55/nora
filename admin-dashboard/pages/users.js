import AdminLayout from "../components/AdminLayout";
import { fetchWithAuth } from "../lib/api";
import { Users as UsersIcon, Shield, Trash2, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/admin/users");
      if (res.ok) setUsers(await res.json());
    } catch (e) {}
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function changeRole(userId, newRole) {
    try {
      const res = await fetchWithAuth(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) loadUsers();
    } catch (e) {}
  }

  async function deleteUser(userId) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await fetchWithAuth(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) loadUsers();
    } catch (e) {}
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            User Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            View and manage all registered users.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-16 flex justify-center">
              <Loader2 size={28} className="animate-spin text-red-500" />
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Email
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Role
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Created
                  </th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                          <UsersIcon size={14} />
                        </div>
                        <span className="text-sm font-medium text-slate-900">
                          {user.email}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role}
                        onChange={(e) => changeRole(user.id, e.target.value)}
                        className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => deleteUser(user.id)}
                        className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
