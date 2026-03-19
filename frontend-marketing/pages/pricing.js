import { useState } from "react";
import Link from "next/link";
import { Check, Zap, Shield, Crown, ArrowRight } from "lucide-react";

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with AI agents at no cost.",
    icon: Zap,
    color: "slate",
    features: [
      "Up to 3 agents",
      "2 vCPU per agent",
      "2 GB RAM per agent",
      "20 GB SSD storage",
      "Community support",
      "Basic integrations",
    ],
    cta: "Get Started Free",
    href: "/signup",
    highlight: false,
  },
  {
    key: "pro",
    name: "Pro",
    price: "$49",
    period: "/month",
    description: "For teams building production-grade agents.",
    icon: Shield,
    color: "blue",
    features: [
      "Up to 10 agents",
      "8 vCPU per agent",
      "16 GB RAM per agent",
      "200 GB SSD storage",
      "Priority support",
      "800+ integrations",
      "Auto-updates & backups",
      "Custom domains",
    ],
    cta: "Start Pro Trial",
    href: "/signup",
    highlight: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "$199",
    period: "/month",
    description: "Unlimited power for enterprise workloads.",
    icon: Crown,
    color: "purple",
    features: [
      "Up to 100 agents",
      "16 vCPU per agent",
      "32 GB RAM per agent",
      "500 GB SSD storage",
      "Dedicated support + SLA",
      "800+ integrations",
      "Auto-updates & daily backups",
      "Custom domains & SSO",
      "Audit logs & compliance",
      "Multi-region deployment",
    ],
    cta: "Contact Sales",
    href: "/signup",
    highlight: false,
  },
];

function PlanCard({ plan }) {
  const Icon = plan.icon;
  const isHighlight = plan.highlight;

  return (
    <div
      className={`relative flex flex-col rounded-3xl p-8 transition-all ${
        isHighlight
          ? "bg-gradient-to-b from-blue-600/20 to-blue-900/20 border-2 border-blue-500/50 shadow-2xl shadow-blue-500/10 scale-105"
          : "bg-white/5 border border-white/10 hover:border-white/20"
      }`}
    >
      {isHighlight && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full">
          Most Popular
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isHighlight ? "bg-blue-600" : "bg-white/10"
          }`}
        >
          <Icon size={20} />
        </div>
        <h3 className="text-xl font-black">{plan.name}</h3>
      </div>

      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-4xl font-black">{plan.price}</span>
        <span className="text-sm text-slate-400 font-medium">{plan.period}</span>
      </div>

      <p className="text-sm text-slate-400 mb-8">{plan.description}</p>

      <ul className="flex flex-col gap-3 mb-8 flex-1">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <Check
              size={16}
              className={isHighlight ? "text-blue-400" : "text-green-400"}
            />
            <span className="text-slate-300">{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={plan.href}
        className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
          isHighlight
            ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
            : "bg-white/10 hover:bg-white/15 text-white"
        }`}
      >
        {plan.cta}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}

export default function Pricing() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white font-sans">
      {/* Header */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-6 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Zap size={18} className="fill-current" />
          </div>
          <span className="text-lg font-black tracking-tight">Nora</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors font-medium">
            Sign In
          </Link>
          <Link
            href="/signup"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 transition-colors text-sm font-bold rounded-xl"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="text-center px-6 py-16 md:py-24 max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight mb-6">
          Simple, transparent
          <br />
          <span className="text-blue-400">pricing</span>
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Start free, scale as you grow. No hidden fees, no surprises. Cancel anytime.
        </p>
      </div>

      {/* Plans Grid */}
      <div className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-6 md:gap-8 items-start">
        {PLANS.map((plan) => (
          <PlanCard key={plan.key} plan={plan} />
        ))}
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-black text-center mb-12">Frequently Asked Questions</h2>
        <div className="flex flex-col gap-6">
          {[
            {
              q: "Can I upgrade or downgrade at any time?",
              a: "Yes! You can change your plan anytime from your dashboard. Upgrades take effect immediately and downgrades apply at the end of your billing period.",
            },
            {
              q: "What happens when I hit my agent limit?",
              a: "You'll be prompted to upgrade your plan. Existing agents continue running — you just can't deploy new ones until you upgrade or remove an agent.",
            },
            {
              q: "Do you offer annual billing?",
              a: "Not yet, but it's coming soon with a 20% discount. Stay tuned!",
            },
            {
              q: "Is there a free trial for Pro?",
              a: "Yes — every new account gets a 14-day Pro trial with full features. No credit card required.",
            },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="font-bold mb-2">{item.q}</h3>
              <p className="text-sm text-slate-400">{item.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer CTA */}
      <div className="text-center px-6 pb-24">
        <p className="text-slate-500 text-sm">
          Questions? <a href="mailto:support@nora.dev" className="text-blue-400 hover:underline">support@nora.dev</a>
        </p>
      </div>
    </div>
  );
}
