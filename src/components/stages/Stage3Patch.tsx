import React, { useState } from 'react';
import { Wrench, Loader2, Copy, Check, AlertCircle } from 'lucide-react';
import { PatchResultData } from '../../types';

interface Stage3PatchProps {
  status: 'pending' | 'running' | 'completed';
  data?: PatchResultData | null;
}

export const Stage3Patch: React.FC<Stage3PatchProps> = ({ status, data }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.patch);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Stage 3: AI PatchResult</h3>
            <span className="text-[10px] font-mono text-slate-400">Subsystem: AI Engine</span>
          </div>
        </div>

        {status === 'running' ? (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" /> Generating patch...
          </span>
        ) : data ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold uppercase tracking-wider">
              AI GENERATED
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold uppercase tracking-wider flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-rose-400" />
              VERIFICATION PENDING
            </span>
          </div>
        ) : (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            Awaiting Stage 2
          </span>
        )}
      </div>

      {status === 'running' ? (
        <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 flex flex-col items-center justify-center gap-3 font-mono text-xs text-amber-300">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
          <span className="font-semibold text-slate-200">Synthesizing minimal unified diff with patch_generator.py...</span>
          <span className="text-[11px] text-slate-400">Constraining modifications to diagnosed single-line scope</span>
        </div>
      ) : data ? (
        <div className="space-y-3.5 text-xs">
          {/* Unified Diff Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span className="font-mono text-[11px] text-slate-300">Unified Diff Proposal</span>
              <button
                onClick={handleCopy}
                className="text-[11px] hover:text-slate-200 flex items-center gap-1 font-mono text-slate-400"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy Diff'}
              </button>
            </div>

            <div className="bg-slate-900 rounded-xl p-3.5 font-mono text-xs border border-slate-800 leading-relaxed overflow-x-auto space-y-0.5">
              <div className="text-slate-500">--- a/backend/demo/calculator.py</div>
              <div className="text-slate-500">+++ b/backend/demo/calculator.py</div>
              <div className="text-cyan-400 font-semibold my-1 text-[11px]">@@ -4,3 +4,3 @@</div>
              <div className="text-slate-400">&nbsp;&nbsp;&nbsp;&nbsp;if price &lt; 0 or discount &lt; 0:</div>
              <div className="text-slate-400">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise ValueError(&quot;Price and discount must be non-negative&quot;)</div>
              {/* Removed line in Red */}
              <div className="bg-rose-950/70 border-l-2 border-rose-500 text-rose-300 px-2 py-0.5 rounded font-mono">
                -&nbsp;&nbsp;&nbsp;&nbsp;return price - discount * 2
              </div>
              {/* Added line in Green */}
              <div className="bg-emerald-950/70 border-l-2 border-emerald-500 text-emerald-300 px-2 py-0.5 rounded font-mono">
                +&nbsp;&nbsp;&nbsp;&nbsp;return price - discount
              </div>
            </div>
          </div>

          {/* Diff Metadata */}
          <div className="grid grid-cols-3 gap-2 font-mono text-xs text-slate-300">
            <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 text-center">
              <span className="text-slate-500 text-[10px] block uppercase font-sans">Patch Type</span>
              <span className="text-amber-300 font-semibold text-xs mt-0.5 block">{data.patch_type}</span>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 text-center">
              <span className="text-slate-500 text-[10px] block uppercase font-sans">Affected Files</span>
              <span className="text-cyan-300 font-semibold text-xs mt-0.5 block">{data.affected_files.length}</span>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 text-center">
              <span className="text-slate-500 text-[10px] block uppercase font-sans">Unrelated Changes</span>
              <span className="text-emerald-400 font-semibold text-xs mt-0.5 block">{data.unrelated_changes}</span>
            </div>
          </div>

          {/* Test Recommendation */}
          <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="text-slate-400 font-mono text-[11px] uppercase tracking-wider font-semibold block">
              Test Recommendation:
            </span>
            <code className="text-amber-300 font-mono text-xs bg-slate-950 p-2 rounded-lg border border-slate-800 block">
              {data.test_recommendation}
            </code>
          </div>

          {/* Architectural Guardrail Note */}
          <div className="text-[11px] text-slate-400 bg-amber-950/15 border border-amber-500/20 p-2.5 rounded-lg flex items-center justify-between">
            <span className="text-amber-300/90 font-medium">Architecture Guardrail:</span>
            <span className="font-mono text-slate-300">
              AI proposes candidates; Docker sandbox asserts truth.
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/60 rounded-xl p-8 font-mono text-xs text-slate-500 border border-slate-800 text-center">
          Awaiting DiagnosisResult from Stage 2 to synthesize candidate diff.
        </div>
      )}
    </div>
  );
};
