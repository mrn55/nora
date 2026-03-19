import { useRouter } from "next/router";
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  FileText,
  LogOut,
  Shield,
} from "lucide-react";

export default function AdminLayout({ children }) {
  const router = useRouter();

  const navItems = [
    { name: "Overview", icon: LayoutDashboard, href: "/admin" },
    { name: "Users", icon: Users, href: "/admin/users" },
    { name: "Marketplace", icon: ShoppingBag, href: "/admin/marketplace" },
    { name: "Audit Log", icon: FileText, href: "/admin/audit" },
  ];

  const isActive = (path) => router.pathname === path;

  function handleLogout() {
    localStorage.removeItem("token");
    window.location.href = "/login";
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <div className="w-60 bg-slate-900 text-white flex flex-col border-r border-white/5">
        <div className="p-6 flex items-center gap-3 border-b border-white/5">
          <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center">
            <Shield size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight leading-none">
              Nora
            </span>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-0.5">
              Admin Panel
            </span>
          </div>
        </div>

        <div className="flex-1 p-3 space-y-1 mt-2">
          {navItems.map((item) => (
            <a key={item.name} href={item.href}>
              <div
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive(item.href)
                    ? "bg-red-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon size={18} />
                {item.name}
              </div>
            </a>
          ))}
        </div>

        <div className="p-3 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-white hover:bg-white/5 transition-all w-full"
          >
            <LogOut size={18} />
            Log Out
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-8">{children}</div>
      </div>
    </div>
  );
}
