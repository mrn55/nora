import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useState, useEffect } from "react";

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
    } else {
      setAuthChecked(true);
    }
  }, []);

  if (!authChecked) return null;

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden selection:bg-blue-500/20">
      {/* Sidebar - Desktop */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <Sidebar />
      </div>

      {/* Sidebar - Mobile Toggle Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)}></div>
          <div className="relative flex flex-col w-64 bg-slate-950 animate-in slide-in-from-left duration-300">
             <Sidebar />
          </div>
        </div>
      )}
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        
        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-[#f8fafc]">
          <div className="w-full px-3 py-4 sm:px-4 md:px-6 lg:px-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
