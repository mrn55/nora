import Layout from "../../components/layout/Layout";
import { 
  ShoppingBag, Search, Filter, Star, Download, Shield, Zap, Bot, 
  ArrowRight, CheckCircle2, Plus, Loader2, Lock, ExternalLink, 
  ChevronRight, Sparkles, Award
} from "lucide-react";
import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { fetchWithAuth } from "../../lib/api";
import { useToast } from "../../components/Toast";

export default function Marketplace() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const toast = useToast();

  const loadMarketplace = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/marketplace");
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      } else {
        toast.error("Failed to load marketplace listings");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load marketplace");
    }
    setLoading(false);
  };

  const installAgent = async (id) => {
    try {
      const res = await fetchWithAuth("/api/marketplace/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: id }),
      });
      if (res.ok) {
        toast.success("Agent installation started!");
        window.location.href = "/app/agents";
      } else {
        toast.error("Failed to install agent. Please try again.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to install agent");
    }
  };

  useEffect(() => {
    loadMarketplace();
  }, []);

  const categories = ["All", "Marketing", "Finance", "DevOps", "Sales", "Support"];
  const filteredItems = category === "All" ? items : items.filter(i => i.category === category);

  return (
    <Layout>
      <div className="flex flex-col gap-8 sm:gap-12 w-full">
        <header className="relative p-8 sm:p-12 md:p-16 rounded-2xl sm:rounded-[2.5rem] md:rounded-[3.5rem] bg-slate-900 overflow-hidden shadow-2xl shadow-blue-500/10 flex flex-col items-start gap-6 border border-white/5">
           <div className="relative z-10 flex flex-col gap-4 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest leading-none mb-2">
                 <Sparkles size={12} className="fill-current" />
                 Nora Marketplace v2.1
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tight leading-none">Expand your fleet with <span className="text-blue-500">pre-built agents</span></h1>
              <p className="text-slate-400 font-medium text-lg leading-relaxed">Browse, install, and deploy specialized OpenClaw agent templates for every operational need.</p>
           </div>
        </header>

        <div className="flex flex-col md:flex-row items-center justify-between gap-8 border-b border-slate-200 pb-10 px-4">
           <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto scrollbar-hide">
              {categories.map(cat => (
                 <button
                   key={cat}
                   onClick={() => setCategory(cat)}
                   className={clsx(
                     "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.15em] transition-all whitespace-nowrap active:scale-95 shadow-sm ring-1",
                     category === cat ? "bg-blue-600 text-white ring-blue-500/50" : "bg-white text-slate-400 hover:text-slate-900 hover:bg-slate-50 ring-slate-200"
                   )}
                 >
                   {cat}
                 </button>
              ))}
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
           {loading ? (
             <div className="col-span-full h-96 flex flex-col items-center justify-center text-slate-400 gap-4 bg-white border border-slate-200 rounded-[3rem] border-dashed">
                <Loader2 size={40} className="animate-spin text-blue-500" />
                <span className="text-sm font-bold uppercase tracking-widest leading-none">Fetching Nora Assets...</span>
             </div>
           ) : filteredItems.map(item => (
             <MarketplaceCard key={item.id} item={item} onInstall={() => installAgent(item.id)} />
           ))}
        </div>
      </div>
    </Layout>
  );
}

function MarketplaceCard({ item, onInstall }) {
  return (
    <div className="group bg-white border border-slate-200 rounded-[2.5rem] shadow-sm hover:shadow-2xl hover:shadow-blue-500/10 hover:border-blue-500/20 transition-all duration-500 overflow-hidden flex flex-col p-1 active:scale-[0.99] cursor-pointer relative">
       {item.premium && (
          <div className="absolute top-6 right-6 z-10 p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 shadow-sm transition-transform group-hover:scale-110 group-hover:rotate-6">
             <Award size={18} className="fill-current" />
          </div>
       )}
       
       <div className="p-8 pb-4 flex flex-col gap-6">
          <div className={clsx(
             "w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-blue-500/20",
             item.category === "Marketing" ? "bg-orange-50 text-orange-600 shadow-orange-500/10" :
             item.category === "Finance" ? "bg-emerald-50 text-emerald-600 shadow-emerald-500/10" :
             item.category === "DevOps" ? "bg-indigo-50 text-indigo-600 shadow-indigo-500/10" :
             "bg-blue-50 text-blue-600 shadow-blue-500/10"
          )}>
             <Bot size={32} strokeWidth={2.5} />
          </div>
          
          <div className="flex flex-col gap-2">
             <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-slate-900 leading-tight group-hover:text-blue-600 transition-colors">{item.name}</h3>
             </div>
             <p className="text-sm text-slate-500 font-medium leading-relaxed line-clamp-2">{item.description}</p>
          </div>
       </div>

       <div className="px-8 py-4 flex items-center justify-between border-t border-slate-50 mt-4">
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-1 text-slate-900 font-black">
                <Star size={14} className="text-amber-500 fill-current" />
                <span className="text-xs leading-none">{item.rating || 4.5}</span>
             </div>
             <div className="flex items-center gap-1 text-slate-400 font-bold">
                <Download size={14} />
                <span className="text-[10px] uppercase tracking-widest leading-none">{item.installs || "1.2k"}</span>
             </div>
          </div>
          <div className="text-sm font-black text-slate-900 tracking-tight leading-none bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 shadow-sm">
             {item.price || "Free"}
          </div>
       </div>

       <div className="mt-auto p-4 pt-2">
          <button onClick={(e) => { e.stopPropagation(); onInstall(); }} className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-slate-900 hover:bg-blue-600 border border-slate-800 hover:border-blue-500 transition-all text-sm font-bold text-white rounded-2xl shadow-lg active:scale-95 group/btn overflow-hidden relative">
             <div className="flex items-center gap-2 relative z-10">
                <Plus size={18} className="transition-transform group-hover/btn:rotate-90 group-hover/btn:scale-110" />
                Install Agent
             </div>
             <div className="absolute inset-0 bg-blue-600 opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
          </button>
       </div>
    </div>
  );
}
