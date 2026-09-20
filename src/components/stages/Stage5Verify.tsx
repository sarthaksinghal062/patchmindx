import React from 'react';
import {
  Terminal,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Box,
  Cpu,
  Clock,
  WifiOff,
} from 'lucide-react';
import { VerificationResultData } from '../../types';

interface Stage5VerifyProps {
  status: 'pending' | 'running' | 'completed';
  data?: VerificationResultData | null;
  stepMessage?: string;
}

export const Stage5Verify: React.FC<Stage5VerifyProps> = ({
  status,
  data,
  stepMessage,
}) => {
  const isPass = data && data.status === 'PASS';
  const isFail = data && data.status === 'FAIL';

  return (
    <div
      className={`rounded-2xl p-5 shadow-2xl space-y-4 transition-all border ${
        isPass
          ? 'bg-slate-950 border-emerald-500/60 ring-1 ring-emerald-500/40 shadow-emerald-950/30'
          : isFail
          ? 'bg-slate-950 border-rose-500/60 ring-1 ring-rose-500/40 shadow-rose-950/30'
          : 'bg-slate-950 border-slate-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
              isPass
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : isFail
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <span>Stage 5: Docker Sandbox Verification</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700 font-normal">
                ISOLATED EXECUTION
              </span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">Subsystem: Docker Sandbox</span>
          </div>
        </div>

        {status === 'running' ? (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 animate-pulse font-semibold">
            <Loader2 className="w-3 h-3 animate-spin" /> Sandboxing...
          </span>
        ) : isPass ? (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-bold tracking-wide flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> EXIT CODE: 0
          </span>
        ) : isFail ? (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/50 font-bold tracking-wide flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> EXIT CODE: 1
          </span>
        ) : (
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
            Awaiting Stage 4
          </span>
        )}
      </div>

      {status === 'running' ? (
        <div className="bg-slate-900 rounded-xl p-6 border border-emerald-500/40 space-y-3 font-mono text-xs">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{stepMessage || 'Spinning up ephemeral Docker container...'}</span>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1 text-slate-300 text-[11px]">
            <p className="text-slate-500">$ docker run --rm -v /sandbox:/workspace --network none patchmind-runner:3.11</p>
            <p className="text-cyan-400">$ git apply candidate_patch.diff</p>
            <p className="text-amber-300">$ pytest tests/test_calculator.py -v</p>
          </div>
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* Container Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-[11px]">
            <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans">Container</span>
              <span className="text-white font-semibold truncate block mt-0.5">{data.container}</span>
            </div>
            <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans">Runtime</span>
              <span className="text-cyan-300 font-semibold block mt-0.5">{data.runtime}</span>
            </div>
            <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans">Framework</span>
              <span className="text-amber-300 font-semibold block mt-0.5">{data.framework}</span>
            </div>
            <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans">Network</span>
              <span className="text-slate-300 font-semibold flex items-center gap-1 mt-0.5">
                <WifiOff className="w-3 h-3 text-rose-400" /> {data.network}
              </span>
            </div>
            <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans">Execution Time</span>
              <span className="text-emerald-400 font-semibold block mt-0.5">{data.duration_s}s</span>
            </div>
          </div>

          {/* Test Execution Metrics */}
          <div className="grid grid-cols-3 gap-3 font-mono text-xs">
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center">
              <span className="text-slate-500 text-[10px] uppercase block font-sans">Passed Tests</span>
              <span className="text-emerald-400 font-bold text-lg block mt-0.5">
                {data.passed} passed
              </span>
            </div>
            <div
              className={`p-3 rounded-xl border text-center ${
                data.failed > 0
                  ? 'bg-rose-950/40 border-rose-500/50'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <span className="text-slate-500 text-[10px] uppercase block font-sans">Failed Tests</span>
              <span
                className={`font-bold text-lg block mt-0.5 ${
                  data.failed > 0 ? 'text-rose-400' : 'text-slate-400'
                }`}
              >
                {data.failed} failed
              </span>
            </div>
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-center">
              <span className="text-slate-500 text-[10px] uppercase block font-sans">Exit Code</span>
              <span
                className={`font-bold text-lg block mt-0.5 ${
                  data.exit_code === 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {data.exit_code}
              </span>
            </div>
          </div>

          {/* Result Card: PASS (Section 9) vs FAIL (Section 10) */}
          {isPass ? (
            <div className="bg-gradient-to-r from-emerald-950/80 to-slate-900 border-2 border-emerald-500 rounded-xl p-4 shadow-lg shadow-emerald-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-300">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white tracking-wide">
                      ✓ VERIFIED
                    </h4>
                    <p className="text-xs font-mono font-bold text-emerald-400">
                      VERIFIED AGAINST SELECTED TESTS
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold px-3 py-1 rounded bg-emerald-500 text-slate-950 uppercase tracking-wider shadow">
                  PASS
                </span>
              </div>
              <p className="text-xs text-slate-300 pt-1 leading-relaxed">
                Docker container asserted all selected pytest assertions pass without regressions.
              </p>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-rose-950/80 to-slate-900 border-2 border-rose-500 rounded-xl p-4 shadow-lg shadow-rose-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-400/50 flex items-center justify-center text-rose-300">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-rose-300 tracking-wide">
                      VERIFICATION FAILED
                    </h4>
                    <p className="text-xs font-mono text-rose-400">
                      Tests failed inside container. Patch rejected.
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold px-3 py-1 rounded bg-rose-600 text-white uppercase tracking-wider shadow">
                  FAILED
                </span>
              </div>

              {/* Section 10 Triad Badges */}
              <div className="grid grid-cols-3 gap-2 font-mono text-xs pt-1">
                <div className="bg-slate-950/90 p-2 rounded-lg border border-slate-800 text-center">
                  <span className="text-slate-500 text-[10px] block font-sans">AI PATCH</span>
                  <span className="text-emerald-400 font-bold block mt-0.5">✓ Generated</span>
                </div>
                <div className="bg-slate-950/90 p-2 rounded-lg border border-rose-500/30 text-center">
                  <span className="text-slate-500 text-[10px] block font-sans">VERIFICATION</span>
                  <span className="text-rose-400 font-bold block mt-0.5">✗ Failed</span>
                </div>
                <div className="bg-slate-950/90 p-2 rounded-lg border border-rose-500/30 text-center">
                  <span className="text-slate-500 text-[10px] block font-sans">VERIFIED FIX</span>
                  <span className="text-rose-400 font-bold block mt-0.5">NO</span>
                </div>
              </div>

              <p className="text-xs text-rose-200/90 pt-1 leading-relaxed">
                The Docker sandbox prevented an unverified or flawed patch from merging into production.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/60 rounded-xl p-8 font-mono text-xs text-slate-500 border border-slate-800 text-center">
          Awaiting validated patch from Stage 4 to mount and execute inside isolated Docker container.
        </div>
      )}
    </div>
  );
};
