import React from 'react';
import {
  Layers,
  Play,
  RotateCcw,
  Loader2,
  Bug,
  Brain,
  Wrench,
  ShieldCheck,
  Terminal,
  FileText,
  Check,
  AlertCircle,
  Clock,
  Settings2,
} from 'lucide-react';
import { PipelineStage, StageState, SimulationScenario } from '../types';

interface StageCardConfig {
  id: string;
  stepNum: string;
  title: string;
  owner: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STAGES: StageCardConfig[] = [
  {
    id: 'reproduce',
    stepNum: '01',
    title: 'Reproduce',
    owner: 'Docker Sandbox',
    desc: 'Capture pytest baseline failure trace',
    icon: Bug,
  },
  {
    id: 'analyze',
    stepNum: '02',
    title: 'Analyze',
    owner: 'AI Engine',
    desc: 'Infer AST root cause & affected files',
    icon: Brain,
  },
  {
    id: 'patch',
    stepNum: '03',
    title: 'Patch',
    owner: 'AI Engine',
    desc: 'Synthesize minimal unified diff',
    icon: Wrench,
  },
  {
    id: 'validate',
    stepNum: '04',
    title: 'Validate',
    owner: 'FastAPI Validation',
    desc: 'Sanity checks & diff safety bounds',
    icon: ShieldCheck,
  },
  {
    id: 'verify',
    stepNum: '05',
    title: 'Verify',
    owner: 'Docker Sandbox',
    desc: 'Isolated Docker sandbox execution',
    icon: Terminal,
  },
  {
    id: 'report',
    stepNum: '06',
    title: 'Report',
    owner: 'Verification Report',
    desc: 'Evidence-backed verification summary',
    icon: FileText,
  },
];

interface PipelineControlProps {
  pipelineStage: PipelineStage;
  stageStates: Record<string, StageState>;
  isSimulating: boolean;
  onSimulate: () => void;
  onLiveRun?: () => void;
  scenario: SimulationScenario;
  onScenarioChange: (scenario: SimulationScenario) => void;
}

export const PipelineControl: React.FC<PipelineControlProps> = ({
  pipelineStage,
  stageStates,
  isSimulating,
  onSimulate,
  onLiveRun,
  scenario,
  onScenarioChange,
}) => {
  const isCompleted = pipelineStage === 'completed' || pipelineStage === 'failed';

  const getStateBadge = (state: StageState) => {
    switch (state) {
      case 'RUNNING':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-semibold animate-pulse">
            <Loader2 className="w-2.5 h-2.5 animate-spin" /> RUNNING
          </span>
        );
      case 'PASSED':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-semibold">
            <Check className="w-2.5 h-2.5" /> PASSED
          </span>
        );
      case 'FAILED':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 font-semibold">
            <AlertCircle className="w-2.5 h-2.5" /> FAILED
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
            SKIPPED
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-500 border border-slate-700/60 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5 opacity-60" /> PENDING
          </span>
        );
    }
  };

  return (
    <section id="pipeline-status-card" className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl">
      {/* Top Header with Simulation Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            End-to-End Execution Pipeline
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Decoupled multi-agent architecture: AI proposes diagnoses & patches; Docker sandbox asserts truth.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Scenario Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
            <Settings2 className="w-3.5 h-3.5 text-slate-400 ml-1" />
            <span className="text-slate-400 text-[11px] font-medium pr-1">Scenario:</span>
            <button
              disabled={isSimulating}
              onClick={() => onScenarioChange('success')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                scenario === 'success'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Passing Fix (9/9)
            </button>
            <button
              disabled={isSimulating}
              onClick={() => onScenarioChange('failure')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                scenario === 'failure'
                  ? 'bg-rose-950 text-rose-300 border border-rose-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Flawed Patch (Fail)
            </button>
          </div>

          {/* Live Backend Run Button */}
          {onLiveRun && (
            <button
              id="btn-run-live-backend"
              onClick={onLiveRun}
              disabled={isSimulating}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all border ${
                isSimulating
                  ? 'bg-slate-800 text-slate-400 border-slate-700 cursor-not-allowed opacity-80'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20 active:scale-95'
              }`}
              title="Trigger real FastAPI backend run with database persistence and sandbox verification"
            >
              {isSimulating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-slate-950 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
                  <span>▶ Run Live Backend (FastAPI)</span>
                </>
              )}
            </button>
          )}

          {/* Primary Simulate Pipeline Button */}
          <button
            id="btn-re-run-demo"
            onClick={onSimulate}
            disabled={isSimulating}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
              isSimulating
                ? 'bg-slate-800 text-slate-400 border-slate-700 cursor-not-allowed opacity-80'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 hover:border-slate-600 active:scale-95'
            }`}
          >
            {isSimulating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span>Running...</span>
              </>
            ) : isCompleted ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Re-Simulate</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>⚡ Simulate</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 6 Connected Stages Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-4">
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const state = stageStates[stage.id] || 'PENDING';
          const isCurrentActive = state === 'RUNNING';
          const isPassed = state === 'PASSED';
          const isFailed = state === 'FAILED';

          return (
            <div
              key={stage.id}
              className={`relative rounded-xl p-3.5 transition-all border flex flex-col justify-between ${
                isCurrentActive
                  ? 'bg-amber-950/20 border-amber-500/60 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/40'
                  : isPassed
                  ? 'bg-slate-900/90 border-slate-700/80 hover:border-slate-600'
                  : isFailed
                  ? 'bg-rose-950/20 border-rose-500/60 ring-1 ring-rose-500/30'
                  : 'bg-slate-900/40 border-slate-800/80 opacity-75'
              }`}
            >
              <div>
                {/* Header with Step number & Status */}
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="font-mono text-xs font-bold text-slate-400">
                    {stage.stepNum}
                  </span>
                  {getStateBadge(state)}
                </div>

                {/* Stage Title & Icon */}
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                      isCurrentActive
                        ? 'bg-amber-500/20 text-amber-300'
                        : isPassed
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : isFailed
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="font-bold text-xs text-white tracking-tight">{stage.title}</h3>
                </div>

                {/* Owner Tag */}
                <div className="text-[10px] font-mono text-amber-400/90 font-medium mb-1.5 truncate">
                  {stage.owner}
                </div>

                {/* Description */}
                <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                  {stage.desc}
                </p>
              </div>

              {/* Progress connector line for desktop */}
              {idx < STAGES.length - 1 && (
                <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      isPassed ? 'bg-slate-600' : 'bg-slate-800'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
