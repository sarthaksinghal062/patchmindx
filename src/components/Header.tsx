import React from 'react';
import { Bug, Sparkles, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  systemReady?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ systemReady = true }) => {
  return (
    <header id="app-header" className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-30 px-4 sm:px-6 py-3.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Subtitle */}
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-lg shadow-amber-500/20 ring-1 ring-amber-400/30">
            <Bug className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>PatchMind</span>
              </h1>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-mono font-medium border border-amber-500/30">
                AI Engine v1.0
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 font-sans">
              <span>Autonomous Bug Detection & Sandbox Verification Engine</span>
            </p>
          </div>
        </div>

        {/* System Ready & Core Thesis Indicator */}
        <div className="flex items-center gap-3">
          {/* Core Principle Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">Core Principle:</span>
            <span className="font-semibold text-white tracking-wide">AI proposes.</span>
            <span className="font-semibold text-emerald-400 tracking-wide">Sandbox verifies.</span>
          </div>

          {/* System Status */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-xs font-mono">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-emerald-300 font-medium text-[11px] tracking-wider">
              SYSTEM READY
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
