import AdminLayout from "../components/AdminLayout";
import { fetchWithAuth } from "../lib/api";
import { ShoppingBag, Trash2, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

export default function MarketplaceAdmin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadItems() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/marketplace");
      if (res.ok) setItems(await res.json());
    } catch (e) {}
    setLoading(false);
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function removeListing(id) {
    if (!confirm("Remove this marketplace listing?")) return;
    try {
      const res = await fetchWithAuth(`/api/admin/marketplace/${id}`, {
        method: "DELETE",
      });
      if (res.ok) loadItems();
    } catch (e) {}
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Marketplace Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review and moderate marketplace listings.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-16 flex justify-center">
              <Loader2 size={28} className="animate-spin text-red-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <ShoppingBag size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No marketplace listings</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Name
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Price
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Category
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Created
                  </th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">
                          {item.name}
                        </span>
                        <span className="text-xs text-slate-400 truncate max-w-xs">
                          {item.description}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">
                      {item.price}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {item.category || "General"}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => removeListing(item.id)}
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
