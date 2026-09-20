import React, { useState } from 'react';
import { History, CheckCircle2, XCircle, Clock, ExternalLink, ArrowRight, Play, Eye } from 'lucide-react';
import { RUN_HISTORY } from '../../data/mockData';
import { RunHistoryItem } from '../../types';

interface RunHistoryTabProps {
  onLoadRun?: (run: RunHistoryItem) => void;
}

export const RunHistoryTab: React.FC<RunHistoryTabProps> = ({ onLoadRun }) => {
  const [selectedRun, setSelectedRun] = useState<RunHistoryItem | null>(RUN_HISTORY[0]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-amber-400" />
              Platform Run History
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Audit trail of all automated AI diagnosis, patch generation, and Docker sandbox verification runs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-900 text-slate-300 border border-slate-800">
              5 Total Executions Logged
            </span>
          </div>
        </div>

        {/* Table of Runs */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3">Run ID</th>
                <th className="py-3 px-3">Repository</th>
                <th className="py-3 px-3">Bug Description</th>
                <th className="py-3 px-3">Tests</th>
                <th className="py-3 px-3">Verification</th>
                <th className="py-3 px-3">Duration</th>
                <th className="py-3 px-3">Created</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {RUN_HISTORY.map((run) => {
                const isVerified = run.verification === 'VERIFIED';
                const isSelected = selectedRun?.id === run.id;

                return (
                  <tr
                    key={run.id}
                    onClick={() => setSelectedRun(run)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-amber-500/10 text-white'
                        : 'hover:bg-slate-900/60 text-slate-300'
                    }`}
                  >
                    <td className="py-3 px-3 font-bold text-amber-400">
                      {run.id}
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-sans">
                      {run.repo}
                    </td>
                    <td className="py-3 px-3 font-sans text-white max-w-[200px] truncate">
                      {run.bug}
                    </td>
                    <td className="py-3 px-3">
                      <span className={isVerified ? 'text-emerald-400' : 'text-rose-400'}>
                        {run.tests}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          isVerified
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {isVerified ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {run.verification}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {run.duration}
                    </td>
                    <td className="py-3 px-3 text-slate-500 font-sans">
                      {run.created}
                    </td>
                    <td className="py-3 px-3 text-right font-sans">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRun(run);
                          if (onLoadRun) onLoadRun(run);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1 transition-colors border border-slate-700"
                      >
                        <Eye className="w-3 h-3 text-amber-400" />
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Run Details Modal / Card */}
      {selectedRun && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-amber-400 text-base">
                {selectedRun.id}
              </span>
              <span className="text-slate-400 text-xs">•</span>
              <span className="text-white text-xs font-semibold">
                {selectedRun.bug}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded font-mono text-xs font-bold border ${
                  selectedRun.verification === 'VERIFIED'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {selectedRun.verification}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans uppercase">Repository</span>
              <span className="text-slate-200 font-semibold block mt-0.5">{selectedRun.repo}</span>
            </div>
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans uppercase">Tests Status</span>
              <span className="text-emerald-400 font-semibold block mt-0.5">{selectedRun.tests}</span>
            </div>
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans uppercase">Docker Exit Code</span>
              <span className="text-cyan-300 font-semibold block mt-0.5">{selectedRun.exit_code}</span>
            </div>
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans uppercase">Execution Time</span>
              <span className="text-amber-300 font-semibold block mt-0.5">{selectedRun.duration}</span>
            </div>
          </div>

          <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-semibold text-white">Interactive Demonstration</p>
              <p className="text-slate-400 text-[11px]">
                Reopen and simulate this exact debugging pipeline in the Demo Pipeline view.
              </p>
            </div>
            {onLoadRun && (
              <button
                onClick={() => onLoadRun(selectedRun)}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20"
              >
                <Play className="w-3.5 h-3.5 fill-slate-950" />
                Load in Pipeline Demo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
