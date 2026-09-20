import React, { useState } from 'react';
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Download,
  Terminal,
  Code,
  Check,
  Share2,
} from 'lucide-react';
import { ReportData } from '../../types';

interface Stage6ReportProps {
  status: 'pending' | 'running' | 'completed';
  report?: ReportData | null;
  onViewDiff: () => void;
  onViewTestOutput: () => void;
  onViewLogs: () => void;
}

export const Stage6Report: React.FC<Stage6ReportProps> = ({
  status,
  report,
  onViewDiff,
  onViewTestOutput,
  onViewLogs,
}) => {
  const [copiedExport, setCopiedExport] = useState(false);

  const handleExport = () => {
    if (!report) return;
    const jsonStr = JSON.stringify(report, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2000);
  };

  const isPass = report && report.verification === 'PASS';

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Stage 6: Verification Report</h3>
            <span className="text-[10px] font-mono text-slate-400">Subsystem: Verification & Reporting</span>
          </div>
        </div>

        {report ? (
          <span
            className={`text-[10px] font-mono px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider border ${
              isPass
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}
          >
            {isPass ? 'VERIFIED REPORT' : 'UNVERIFIED REPORT'}
          </span>
        ) : (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            Awaiting Stage 5
          </span>
        )}
      </div>

      {report ? (
        <div className="space-y-4 text-xs">
          {/* Executive Summary Grid */}
          <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="font-mono text-slate-400 uppercase text-[11px] font-bold">
                Bug Summary
              </span>
              <span className="text-cyan-400 font-mono text-[11px] font-medium">
                Target: backend/demo/calculator.py
              </span>
            </div>
            <p className="text-slate-200 text-xs leading-relaxed font-sans">
              {report.bug_summary}
            </p>
          </div>

          {/* Baseline vs After Patch Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <div className="text-slate-400 text-[10px] font-sans uppercase mb-1.5 font-bold">
                Baseline Results (Pre-Patch):
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="text-rose-400 font-semibold flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>{report.baseline.failed} failed</span>
                </div>
                <div className="text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{report.baseline.passed} passed</span>
                </div>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                isPass
                  ? 'bg-slate-900/80 border-slate-800'
                  : 'bg-rose-950/30 border-rose-500/40'
              }`}
            >
              <div className="text-slate-400 text-[10px] font-sans uppercase mb-1.5 font-bold">
                Post-Patch Results (Sandbox):
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{report.after_patch.passed} passed</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 ${
                    report.after_patch.failed > 0
                      ? 'text-rose-400 font-semibold'
                      : 'text-slate-500'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>{report.after_patch.failed} failed</span>
                </div>
              </div>
            </div>
          </div>

          {/* Verification Evidence & Execution Metadata */}
          <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-[11px]">
            <div>
              <span className="text-slate-500 text-[10px] block font-sans">Verified by</span>
              <span className="text-white font-semibold">{report.verified_by}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block font-sans">Test Framework</span>
              <span className="text-amber-300 font-semibold">{report.framework}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block font-sans">Exit Code</span>
              <span
                className={`font-semibold ${
                  report.exit_code === 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {report.exit_code}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block font-sans">Verification</span>
              <span
                className={`font-bold ${
                  isPass ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {report.verification}
              </span>
            </div>
          </div>

          {/* Four Action Buttons from Section 11 */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={onViewDiff}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs flex items-center gap-1.5 transition-colors font-medium"
            >
              <Code className="w-3.5 h-3.5 text-amber-400" />
              View Full Diff
            </button>
            <button
              onClick={onViewTestOutput}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs flex items-center gap-1.5 transition-colors font-medium"
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              View Test Output
            </button>
            <button
              onClick={onViewLogs}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs flex items-center gap-1.5 transition-colors font-medium"
            >
              <FileText className="w-3.5 h-3.5 text-purple-400" />
              View Logs
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors ml-auto shadow-sm"
            >
              {copiedExport ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
              {copiedExport ? 'Report Copied!' : 'Export Report'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/60 rounded-xl p-8 font-mono text-xs text-slate-500 border border-slate-800 text-center">
          Awaiting Stage 5 Docker sandbox completion to compile final audit verification report.
        </div>
      )}
    </div>
  );
};
