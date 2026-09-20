import React from 'react';
import { Brain, Loader2, Sparkles, FileText, CheckCircle2 } from 'lucide-react';
import { DiagnosisResultData } from '../../types';

interface Stage2AnalyzeProps {
  status: 'pending' | 'running' | 'completed';
  data?: DiagnosisResultData | null;
}

export const Stage2Analyze: React.FC<Stage2AnalyzeProps> = ({ status, data }) => {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Stage 2: AI DiagnosisResult</h3>
            <span className="text-[10px] font-mono text-slate-400">Subsystem: AI Engine</span>
          </div>
        </div>

        {status === 'running' ? (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" /> AI analyzing failure...
          </span>
        ) : data ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold uppercase tracking-wider">
              AI ANALYSIS
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
              Not Verified
            </span>
          </div>
        ) : (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            Awaiting Stage 1
          </span>
        )}
      </div>

      {status === 'running' ? (
        <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 flex flex-col items-center justify-center gap-3 font-mono text-xs text-amber-300">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
          <span className="font-semibold text-slate-200">Synthesizing AST & failure context with bug_analyzer.py...</span>
          <span className="text-[11px] text-slate-400">Querying bounded prompt template against failing assertion</span>
        </div>
      ) : data ? (
        <div className="space-y-3.5 text-xs">
          {/* Root Cause Card */}
          <div className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-mono text-[11px] uppercase tracking-wider font-semibold">
                Root Cause
              </span>
              <span className="text-emerald-400 font-mono font-bold text-xs bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                Confidence: {data.confidence}%
              </span>
            </div>
            <p className="font-semibold text-amber-200 text-sm leading-snug">
              {data.root_cause}
            </p>
          </div>

          {/* Reasoning Evidence */}
          <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800 space-y-2">
            <span className="text-slate-400 font-mono text-[11px] uppercase tracking-wider font-semibold block">
              Reasoning Evidence
            </span>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                <span className="text-slate-500 text-[10px] block">Expected calculation:</span>
                <span className="text-emerald-300 font-semibold">{data.expected_calc}</span>
              </div>
              <div className="bg-slate-950 p-2 rounded-lg border border-rose-500/30">
                <span className="text-slate-500 text-[10px] block">Actual calculation:</span>
                <span className="text-rose-300 font-semibold">{data.actual_calc}</span>
              </div>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed pt-1">
              {data.explanation}
            </p>
          </div>

          {/* Affected Files & Suggested Fix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[11px] block uppercase font-sans mb-1 font-semibold">
                Affected Files
              </span>
              <div className="text-cyan-300 font-mono text-[11px] bg-slate-950 p-1.5 rounded border border-slate-800">
                {data.affected_files[0] || 'backend/demo/calculator.py'}
              </div>
            </div>
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[11px] block uppercase font-sans mb-1 font-semibold">
                Suggested Fix
              </span>
              <div className="text-slate-300 text-[11px] leading-snug">
                {data.suggested_fix}
              </div>
            </div>
          </div>

          {/* Epistemic Uncertainty statement */}
          <div className="text-[11px] text-slate-400 italic bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60 flex items-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>{data.uncertainty}</span>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/60 rounded-xl p-8 font-mono text-xs text-slate-500 border border-slate-800 text-center">
          Awaiting Stage 1 failure reproduction to invoke bug_analyzer.py.
        </div>
      )}
    </div>
  );
};
