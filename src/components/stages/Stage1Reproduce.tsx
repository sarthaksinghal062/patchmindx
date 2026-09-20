import React from 'react';
import { Bug, CheckCircle2, AlertTriangle, Loader2, Copy, Check } from 'lucide-react';
import { CODE_CALCULATOR } from '../../data/mockData';

interface Stage1ReproduceProps {
  status: 'pending' | 'running' | 'completed';
  errorDetails?: {
    passed: number;
    failed: number;
    errorName: string;
    expected: string;
    actual: string;
  } | null;
}

export const Stage1Reproduce: React.FC<Stage1ReproduceProps> = ({ status, errorDetails }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(CODE_CALCULATOR);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Bug className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Stage 1: Pytest Failure Trace</h3>
            <span className="text-[10px] font-mono text-slate-400">Subsystem: Docker Sandbox</span>
          </div>
        </div>

        {status === 'running' ? (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" /> Running pytest...
          </span>
        ) : status === 'completed' ? (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Failure reproduced
          </span>
        ) : (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            Awaiting execution
          </span>
        )}
      </div>

      {status === 'running' ? (
        <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 flex flex-col items-center justify-center gap-3 font-mono text-xs text-amber-300">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
          <span className="font-semibold text-slate-200">Executing pytest tests/test_calculator.py inside Docker...</span>
          <span className="text-[11px] text-slate-400">Running isolated baseline pass to capture stack trace</span>
        </div>
      ) : errorDetails ? (
        <div className="space-y-4">
          {/* Baseline Test Run Summary */}
          <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                BASELINE TEST RUN
              </span>
              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="text-rose-400 font-bold bg-rose-950/60 px-2 py-0.5 rounded border border-rose-500/30">
                  {errorDetails.failed} failed
                </span>
                <span className="text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  {errorDetails.passed} passed
                </span>
              </div>
            </div>

            {/* Error Message */}
            <div className="bg-rose-950/40 border border-rose-500/40 rounded-lg p-2.5 font-mono text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-semibold tracking-wide">{errorDetails.errorName}</span>
            </div>
          </div>

          {/* Source Code with Highlighted Buggy Line */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span className="font-mono text-[11px]">backend/demo/calculator.py</span>
              <button
                onClick={handleCopy}
                className="text-[11px] hover:text-slate-200 flex items-center gap-1 font-mono text-slate-400"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="bg-slate-900 rounded-xl p-3.5 font-mono text-xs border border-slate-800 leading-relaxed overflow-x-auto">
              <div className="text-slate-400">
                <span className="text-slate-600 select-none mr-3">1</span>
                <span className="text-purple-400">def</span> <span className="text-blue-400">calculate_discounted_price</span>(price: <span className="text-amber-400">float</span>, discount: <span className="text-amber-400">float</span>):
              </div>
              <div className="text-slate-400">
                <span className="text-slate-600 select-none mr-3">2</span>
                &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-purple-400">if</span> price &lt; <span className="text-cyan-400">0</span> <span className="text-purple-400">or</span> discount &lt; <span className="text-cyan-400">0</span>:
              </div>
              <div className="text-slate-400">
                <span className="text-slate-600 select-none mr-3">3</span>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-purple-400">raise</span> <span className="text-rose-400">ValueError</span>(<span className="text-emerald-400">&quot;Price and discount must be non-negative&quot;</span>)
              </div>
              <div className="text-slate-400">
                <span className="text-slate-600 select-none mr-3">4</span>
              </div>
              {/* Highlighted Buggy Line */}
              <div className="bg-rose-950/60 border border-rose-500/50 rounded px-1 -mx-1 py-0.5 text-rose-200 font-bold flex items-center justify-between">
                <div>
                  <span className="text-rose-400 select-none mr-3 font-normal">5</span>
                  &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-purple-300">return</span> price - discount * <span className="text-rose-300 underline underline-offset-2">2</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded border border-rose-500/40">
                  Defective logic
                </span>
              </div>
            </div>
          </div>

          {/* Expected vs Actual Comparison */}
          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block uppercase font-sans">Expected Value</span>
              <span className="text-emerald-400 font-bold text-sm">{errorDetails.expected}</span>
            </div>
            <div className="bg-slate-900 p-2.5 rounded-lg border border-rose-500/30">
              <span className="text-slate-500 text-[10px] block uppercase font-sans">Actual Value (Reproduced)</span>
              <span className="text-rose-400 font-bold text-sm">{errorDetails.actual}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/60 rounded-xl p-8 font-mono text-xs text-slate-500 border border-slate-800 text-center">
          Click &quot;▶ Simulate Pipeline&quot; above to trigger baseline pytest failure reproduction.
        </div>
      )}
    </div>
  );
};
