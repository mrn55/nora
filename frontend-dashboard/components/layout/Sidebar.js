import { useRouter } from "next/router";
import { 
  LayoutDashboard, Bot, Rocket, BarChart3, 
  Settings, ChevronRight, ScrollText
} from "lucide-react";
import { clsx } from "clsx";

export default function Sidebar() {
  const router = useRouter();

  const navItems = [
    { name: "Dashboard", icon: LayoutDashboard, href: "/app/dashboard" },
    { name: "Agents", icon: Bot, href: "/app/agents" },
    { name: "Deploy", icon: Rocket, href: "/app/deploy" },
    { name: "Monitoring", icon: BarChart3, href: "/app/monitoring" },
    { name: "Logs", icon: ScrollText, href: "/app/logs" },
  ];

  const isActive = (path) => router.pathname === path;

  return (
    <div className="w-64 bg-slate-950 text-white flex flex-col border-r border-white/5 shadow-2xl z-50 overflow-y-auto">
      <div className="p-8 pb-10 flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-2xl shadow-lg shadow-blue-500/20 text-white">N</div>
        <div className="flex flex-col">
          <span className="text-xl font-bold tracking-tight leading-none text-white">Nora</span>
          <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1 opacity-80">Cloud Director</span>
        </div>
      </div>

      <div className="flex-1 px-4 space-y-1">
        <div className="text-[10px] text-slate-500 font-bold px-4 mb-4 uppercase tracking-[0.2em] opacity-60 flex items-center gap-2">
           Main Operations
           <div className="flex-1 h-[1px] bg-white/5 ml-2"></div>
        </div>
        
        {navItems.map((item) => (
          <a key={item.name} href={item.href} className="block">
            <div className={clsx(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group relative",
              isActive(item.href) 
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}>
              <item.icon size={18} className={clsx(
                "transition-transform group-hover:scale-110",
                isActive(item.href) ? "text-white" : "text-slate-500 group-hover:text-blue-400"
              )} />
              {item.name}
              
              {isActive(item.href) && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full"></div>
              )}
            </div>
          </a>
        ))}
      </div>

      <div className="p-4 mt-auto border-t border-white/5 space-y-1">
         <a href="/app/settings" className="block">
            <div className={clsx(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group",
              isActive("/app/settings") ? "bg-white/10 text-white" : "text-slate-500 hover:text-white hover:bg-white/5"
            )}>
              <Settings size={18} />
              Settings
            </div>
         </a>
      </div>
    </div>
  );
}
