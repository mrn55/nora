import Link from "next/link";
import { Server, Zap, Shield, Globe, Users, ShoppingBag, Menu, X, Cpu, BarChart3, Layers, Lock, ArrowRight, Check } from "lucide-react";
import { useState } from "react";

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const features = [
    { icon: Server, title: "Dedicated Infrastructure", desc: "Every agent gets its own isolated container with guaranteed CPU, RAM, and SSD resources." },
    { icon: Zap, title: "One-Click Deploy", desc: "Provision agents in seconds with Docker, Proxmox LXC, or Kubernetes backends." },
    { icon: Shield, title: "Enterprise Security", desc: "End-to-end encryption, helmet headers, rate limiting, RBAC, and OAuth 2.0." },
    { icon: Globe, title: "Multi-Region", desc: "Deploy agents close to your users across global infrastructure nodes." },
    { icon: Cpu, title: "Auto-Scaling", desc: "Scale from Free to Enterprise. Upgrade resources per agent as your workload grows." },
    { icon: BarChart3, title: "Live Monitoring", desc: "Real-time SSE metrics, activity logs, and health dashboards for every agent." },
    { icon: Layers, title: "Workspaces", desc: "Organize agents into workspaces with role-based access and team collaboration." },
    { icon: Lock, title: "Encrypted Secrets", desc: "Integration tokens stored with AES-256-GCM encryption at rest. Zero plaintext." },
  ];

  const steps = [
    { num: "01", title: "Sign Up", desc: "Create an account with email or OAuth (Google, GitHub). Free tier includes 3 agents." },
    { num: "02", title: "Deploy Agents", desc: "Choose a template from the marketplace or configure a custom agent. Click deploy." },
    { num: "03", title: "Scale & Monitor", desc: "Track performance with live dashboards, organize into workspaces, and scale with Stripe billing." },
  ];

  return (
    <div className="min-h-screen bg-[#0f172a] text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      <nav className="fixed w-full z-50 bg-[#0f172a]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-xl text-white">N</div>
            <span className="text-xl font-bold tracking-tight">Nora</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="/app/marketplace" className="hover:text-white transition-colors">Marketplace</a>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link href="/signup" className="text-sm font-medium hover:text-white transition-colors">Sign up</Link>
            <a href="/app/agents" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-blue-500/20">
              Dashboard
            </a>
          </div>

          <button className="md:hidden p-2 text-slate-400" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0f172a] border-b border-white/5 px-4 pt-2 pb-6 flex flex-col gap-4 animate-in slide-in-from-top duration-300">
            <a href="#features" className="text-sm font-medium text-slate-400 py-2" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-400 py-2" onClick={() => setMobileMenuOpen(false)}>How It Works</a>
            <a href="/app/marketplace" className="text-sm font-medium text-slate-400 py-2" onClick={() => setMobileMenuOpen(false)}>Marketplace</a>
            <hr className="border-white/5" />
            <Link href="/signup" className="text-sm font-medium text-white py-2" onClick={() => setMobileMenuOpen(false)}>Sign up</Link>
            <a href="/app/agents" className="bg-blue-600 hover:bg-blue-700 px-4 py-3 rounded-lg text-sm font-semibold text-center" onClick={() => setMobileMenuOpen(false)}>
              Dashboard
            </a>
          </div>
        )}
      </nav>

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-8 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            New: OpenClaw Agent V2 Workers Released
          </div>

          <h1 className="text-4xl md:text-7xl font-extrabold tracking-tight mb-6 bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent leading-[1.1]">
            Deploy OpenClaw Agents <br className="hidden md:block" /> <span className="text-blue-500">In Seconds</span>
          </h1>

          <p className="max-w-2xl mx-auto text-base md:text-xl text-slate-400 mb-10 leading-relaxed">
            The orchestration layer for your autonomous Nora workforce. Scale, manage, and deploy specialized agents across dedicated infrastructure.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4 sm:px-0">
            <Link href="/signup" className="w-full sm:w-auto bg-white text-slate-950 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-100 transition-all flex items-center justify-center gap-2">
              Get Started Free <Zap size={20} className="fill-current" />
            </Link>
            <a href="#features" className="w-full sm:w-auto bg-slate-900 border border-white/10 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
              Explore Features <ArrowRight size={20} />
            </a>
          </div>
        </div>
      </section>

      {/* ─── Social proof stats ───────────────────────────────── */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "10K+", label: "Agents Deployed" },
            { value: "99.98%", label: "Uptime SLA" },
            { value: "3", label: "Provisioner Backends" },
            { value: "<5s", label: "Deploy Time" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl md:text-4xl font-black text-white">{s.value}</p>
              <p className="text-sm text-slate-500 mt-1 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Features grid ────────────────────────────────────── */}
      <section id="features" className="py-24 px-4 sm:px-6 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-blue-400 text-sm font-bold uppercase tracking-widest mb-3">Platform</p>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight">Everything You Need</h2>
            <p className="text-slate-400 mt-4 max-w-xl mx-auto">Production-grade infrastructure for autonomous agents, from deploy to monitoring.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f) => (
              <div key={f.title} className="group bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-blue-500/20 rounded-2xl p-6 transition-all duration-300">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                  <f.icon size={20} className="text-blue-400" />
                </div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 bg-white/[0.02] border-y border-white/5 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-blue-400 text-sm font-bold uppercase tracking-widest mb-3">Get Started</p>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight">Three Steps to Deploy</h2>
          </div>
          <div className="space-y-0">
            {steps.map((step, i) => (
              <div key={step.num} className="flex gap-6 md:gap-10 items-start">
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-sm font-black shrink-0">
                    {step.num}
                  </div>
                  {i < steps.length - 1 && <div className="w-px h-20 bg-white/10 mt-1" />}
                </div>
                <div className="pb-12">
                  <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                  <p className="text-slate-400 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-6">Ready to Deploy?</h2>
          <p className="text-slate-400 mb-10 text-lg">Start free with 3 agents. No credit card required.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2">
              Create Free Account <ArrowRight size={20} />
            </Link>
            <a href="/app/marketplace" className="w-full sm:w-auto bg-slate-900 border border-white/10 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
              Browse Marketplace <ShoppingBag size={20} />
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-white/5 bg-[#0b1120]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid md:grid-cols-4 gap-10">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">N</div>
                <span className="text-lg font-bold">Nora</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">The orchestration platform for autonomous AI agents.</p>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="/app/marketplace" className="hover:text-white transition-colors">Marketplace</a></li>
                <li><a href="/app/pricing" className="hover:text-white transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Platform</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="/app/agents" className="hover:text-white transition-colors">Dashboard</a></li>
                <li><a href="/app/monitoring" className="hover:text-white transition-colors">Monitoring</a></li>
                <li><a href="/app/workspaces" className="hover:text-white transition-colors">Workspaces</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 mt-10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-600">&copy; {new Date().getFullYear()} Nora. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-400 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-400 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
