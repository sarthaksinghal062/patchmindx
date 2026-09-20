import React from 'react';
import { ShieldCheck, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ValidationStateData } from '../../types';

interface Stage4ValidateProps {
  status: 'pending' | 'running' | 'completed';
  data?: ValidationStateData | null;
}

export const Stage4Validate: React.FC<Stage4ValidateProps> = ({ status, data }) => {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Stage 4: Patch Validation</h3>
            <span className="text-[10px] font-mono text-slate-400">Subsystem: FastAPI Pre-flight</span>
          </div>
        </div>

        {status === 'running' ? (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1.5 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" /> Running pre-flight checks...
          </span>
        ) : data && data.passed ? (
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold tracking-wider uppercase">
            PATCH VALIDATED
          </span>
        ) : (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            Awaiting Stage 3
          </span>
        )}
      </div>

      {status === 'running' ? (
        <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 flex flex-col items-center justify-center gap-3 font-mono text-xs text-purple-300">
          <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          <span className="font-semibold text-slate-200">Executing static AST & safety bounds validation...</span>
          <span className="text-[11px] text-slate-400">Inspecting unified diff format, directory traversal, and patch bounds</span>
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* 7 Specific Checks from Section 8 */}
          <div className="space-y-1.5">
            {data.checks.map((check) => (
              <div
                key={check.id}
                className="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 font-mono text-xs"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="text-slate-200 font-medium">{check.name}</span>
                </div>
                {check.details && (
                  <span className="text-[11px] text-slate-500 truncate max-w-[220px] font-sans">
                    {check.details}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Accepted Banner */}
          <div className="bg-purple-950/30 border border-purple-500/40 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-purple-200 uppercase tracking-wide">
                  PATCH ACCEPTED FOR SANDBOX
                </div>
                <div className="text-[10px] text-slate-400 font-sans">
                  FastAPI verified AST syntax & isolated patch boundaries. Dispatched to Docker sandbox runner.
                </div>
              </div>
            </div>
            <span className="text-[11px] font-mono font-bold text-purple-300 bg-purple-950/80 px-2 py-1 rounded border border-purple-500/30 shrink-0">
              PRE-FLIGHT OK
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/60 rounded-xl p-8 font-mono text-xs text-slate-500 border border-slate-800 text-center">
          Awaiting Stage 3 patch proposal to execute security and syntactic diff validation.
        </div>
      )}
    </div>
  );
};
