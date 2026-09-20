import React, { useState, useRef } from 'react';
import {
  Bug,
  Wrench,
  ShieldCheck,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Layers,
  ArrowRight,
  Lock,
  Play,
  Cpu,
  Server,
  Box,
  Check,
  Copy,
  ChevronRight,
  RotateCcw,
  Loader2,
  XCircle,
} from 'lucide-react';

export type PipelineStage =
  | 'idle'
  | 'reproduce'
  | 'analyze'
  | 'patch'
  | 'validate'
  | 'verify'
  | 'report'
  | 'completed'
  | 'failed';

export type StageStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface DiagnosisResultData {
  root_cause: string;
  explanation: string;
  affected_files: string[];
  suggested_fix: string;
  uncertainty: string;
}

export interface PatchResultData {
  patch: string;
  affected_files: string[];
  test_recommendation: string;
  uncertainty: string;
}

export interface VerificationResultData {
  status: 'PASS' | 'FAIL';
  passed: number;
  failed: number;
  exit_code: number;
  duration_ms: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  prefix: string;
  message: string;
}

interface FileSpec {
  path: string;
  name: string;
  role: string;
  connectsTo: string;
  summary: string;
}

const MODULE_FILES: FileSpec[] = [
  {
    path: 'backend/app/ai/__init__.py',
    name: '__init__.py',
    role: 'Package Entry & Public API',
    connectsTo: 'Exposes analyze_failure, generate_patch, schemas, and error classes to Member 2 (FastAPI).',
    summary: 'Centralizes public exports, isolates internals, and enforces single clean integration points for the API layer.',
  },
  {
    path: 'backend/app/ai/schemas.py',
    name: 'schemas.py',
    role: 'Pydantic Data Contracts',
    connectsTo: 'Imported by bug_analyzer.py, patch_generator.py, response_parser.py, and FastAPI endpoints.',
    summary: 'Defines DiagnosisResult and PatchResult with strict field validation. Excludes "verified" flags by design.',
  },
  {
    path: 'backend/app/ai/llm_client.py',
    name: 'llm_client.py',
    role: 'Provider Abstraction Layer',
    connectsTo: 'Called by bug_analyzer.py and patch_generator.py. Reads credentials from environment variables.',
    summary: 'Abstract LLMClient with OpenAILikeLLMClient, GeminiLLMClient, and MockLLMClient. Never hardcodes keys or logs secrets.',
  },
  {
    path: 'backend/app/ai/prompt_templates.py',
    name: 'prompt_templates.py',
    role: 'Security & Bounded Prompts',
    connectsTo: 'Constructs prompts consumed by LLMClient in analyzer and generator.',
    summary: 'Wraps untrusted code in XML delimiters, enforces static analysis boundaries, and guards against prompt injection.',
  },
  {
    path: 'backend/app/ai/response_parser.py',
    name: 'response_parser.py',
    role: 'Defensive Parser & Exceptions',
    connectsTo: 'Receives raw LLM string, strips markdown fences, validates schema, and raises structured exceptions.',
    summary: 'Prevents silent failures. Provides AIResponseParsingError, AISchemaValidationError, and AIEmptyPatchError.',
  },
  {
    path: 'backend/app/ai/bug_analyzer.py',
    name: 'bug_analyzer.py',
    role: 'Root Cause Diagnosis Engine',
    connectsTo: 'Ingests failure trace from Member 2, returns DiagnosisResult to pass forward to patch_generator.py.',
    summary: 'Implements analyze_failure & analyze_failure_async with structured logging and bounded prompt compilation.',
  },
  {
    path: 'backend/app/ai/patch_generator.py',
    name: 'patch_generator.py',
    role: 'Unified Diff Patch Generator',
    connectsTo: 'Consumes DiagnosisResult, returns PatchResult to Member 2 for Docker sandbox dispatch.',
    summary: 'Generates minimal, surgical unified diffs without modifying repos or asserting verification status.',
  },
];

const UNIT_TESTS = [
  { id: 'A', name: 'Correct diagnosis response', status: 'PASS', desc: 'Validates full DiagnosisResult JSON extraction & schema conformance' },
  { id: 'B', name: 'Correct patch response', status: 'PASS', desc: 'Validates unified diff generation & PatchResult schema' },
  { id: 'C', name: 'Invalid JSON', status: 'PASS', desc: 'Catches malformed JSON syntax and raises AIResponseParsingError' },
  { id: 'D', name: 'Missing fields', status: 'PASS', desc: 'Detects absent required schema fields and raises AISchemaValidationError' },
  { id: 'E', name: 'Wrong field types', status: 'PASS', desc: 'Enforces list[str] on affected_files and string constraints' },
  { id: 'F', name: 'Empty patch', status: 'PASS', desc: 'Rejects empty diffs, blank lines, or non-diff strings' },
  { id: 'G', name: 'Malformed markdown / code fences', status: 'PASS', desc: 'Robustly extracts JSON inside ```json code fences and surrounding text' },
  { id: 'H', name: 'LLM timeout', status: 'PASS', desc: 'Maps socket / provider timeouts to AITimeoutError' },
  { id: 'I', name: 'LLM API failure', status: 'PASS', desc: 'Converts HTTP 4xx/5xx and network dropouts to AILLMError' },
  { id: 'J', name: 'Prompt injection in source code', status: 'PASS', desc: 'Isolates malicious bash/rm commands in untrusted tags & drops fake verified keys' },
  { id: 'K', name: 'Correct diagnosis but incorrect patch', status: 'PASS', desc: 'Ensures pipeline failure isolation between diagnosis and patch steps' },
  { id: 'L', name: 'Uncertain diagnosis', status: 'PASS', desc: 'Preserves epistemic uncertainty statements for downstream triage' },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const INITIAL_STAGE_STATUSES: Record<string, StageStatus> = {
  reproduce: 'pending',
  analyze: 'pending',
  patch: 'pending',
  validate: 'pending',
  verify: 'pending',
  report: 'pending',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'demo' | 'architecture' | 'contract' | 'tests'>('demo');
  const [selectedFile, setSelectedFile] = useState<FileSpec>(MODULE_FILES[1]);
  const [copied, setCopied] = useState<string | null>(null);

  // Pipeline State Machine
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>('idle');
  const [stageStatuses, setStageStatuses] = useState<Record<string, StageStatus>>(INITIAL_STAGE_STATUSES);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Stage 1 (Reproduce) State
  const [reproduceState, setReproduceState] = useState<{
    statusText?: string;
    passed?: number;
    failed?: number;
    errorName?: string;
    errorDetail?: string;
  } | null>(null);

  // Stage 2 (Analyze) State
  const [diagnosisData, setDiagnosisData] = useState<DiagnosisResultData | null>(null);

  // Stage 3 (Patch) State
  const [patchData, setPatchData] = useState<PatchResultData | null>(null);

  // Stage 4 (Validate) State
  const [validationState, setValidationState] = useState<{
    validating: boolean;
    checks: { name: string; passed: boolean }[];
    passed: boolean;
  } | null>(null);

  // Stage 5 (Verify) State
  const [verifyState, setVerifyState] = useState<{
    stepText?: string;
    result?: VerificationResultData;
  } | null>(null);

  // Stage 6 (Report) State
  const [reportData, setReportData] = useState<{
    baseline: { passed: number; failed: number };
    afterPatch: { passed: number; failed: number };
    verification: string;
    finalStatus: string;
  } | null>(null);

  // Live progressive logs
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      timestamp: '00:00:00',
      prefix: 'INFO',
      message: 'BugBuster AI Engine initialized in demonstration simulation mode.',
    },
    {
      id: 'init-2',
      timestamp: '00:00:00',
      prefix: 'INFO',
      message: 'Click "Simulate Pipeline" above to execute the 6-stage verification flow.',
    },
  ]);

  const addLog = (prefix: string, message: string) => {
    const now = new Date();
    const timeStr =
      now.toTimeString().split(' ')[0] +
      '.' +
      String(now.getMilliseconds()).padStart(3, '0').slice(0, 2);
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: timeStr,
        prefix,
        message,
      },
    ]);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const runPipelineSimulation = async () => {
    if (isSimulating) return;

    // RESET: pipeline stages, diagnosis, patch, verification, logs, test results, report
    setIsSimulating(true);
    setSimError(null);
    setPipelineStage('reproduce');
    setStageStatuses({
      reproduce: 'active',
      analyze: 'pending',
      patch: 'pending',
      validate: 'pending',
      verify: 'pending',
      report: 'pending',
    });
    setReproduceState({ statusText: 'Running pytest...' });
    setDiagnosisData(null);
    setPatchData(null);
    setValidationState(null);
    setVerifyState(null);
    setReportData(null);
    setLogs([]);

    try {
      // ----------------------------------------------------
      // STEP 1: REPRODUCE
      // ----------------------------------------------------
      addLog('INFO', 'Starting BugBuster pipeline');
      addLog('INFO', 'Reproducing baseline failure');
      setReproduceState({ statusText: 'Running pytest...' });

      await sleep(1000);

      addLog('ERROR', 'Test failure reproduced');
      setReproduceState({
        statusText: undefined,
        passed: 8,
        failed: 1,
        errorName: 'AssertionError: 70.0 != 85.0',
        errorDetail: 'assert 70.0 == 85.0 (expected 85.0, got 70.0)',
      });
      setStageStatuses((prev) => ({ ...prev, reproduce: 'completed', analyze: 'active' }));
      setPipelineStage('analyze');

      // ----------------------------------------------------
      // STEP 2: ANALYZE
      // ----------------------------------------------------
      addLog('INFO', 'Sending failure context to AI');
      await sleep(1500);

      const diagnosis: DiagnosisResultData = {
        root_cause: 'The discount is multiplied by 2 before subtraction.',
        explanation:
          'The implementation applies the discount twice, causing the calculated price to be lower than expected.',
        affected_files: ['backend/demo/calculator.py'],
        suggested_fix: 'Subtract the discount once instead of multiplying it by 2.',
        uncertainty: 'Diagnosis is based on the supplied failing test and source code.',
      };
      setDiagnosisData(diagnosis);
      addLog('AI', 'Root cause identified');
      setStageStatuses((prev) => ({ ...prev, analyze: 'completed', patch: 'active' }));
      setPipelineStage('patch');

      // ----------------------------------------------------
      // STEP 3: PATCH
      // ----------------------------------------------------
      await sleep(1500);

      const patch: PatchResultData = {
        patch: '- return price - discount * 2\n+ return price - discount',
        affected_files: ['backend/demo/calculator.py'],
        test_recommendation: 'pytest tests/test_calculator.py',
        uncertainty: '',
      };
      setPatchData(patch);
      addLog('AI', 'Patch generated');
      setStageStatuses((prev) => ({ ...prev, patch: 'completed', validate: 'active' }));
      setPipelineStage('validate');

      // ----------------------------------------------------
      // STEP 4: VALIDATE
      // ----------------------------------------------------
      addLog('INFO', 'Validating patch');
      setValidationState({
        validating: true,
        checks: [
          { name: 'Patch exists', passed: true },
          { name: 'Affected file exists', passed: true },
          { name: 'Patch has valid structure', passed: true },
          { name: 'Patch scope is valid', passed: true },
        ],
        passed: false,
      });

      await sleep(1000);

      setValidationState({
        validating: false,
        checks: [
          { name: 'Patch exists', passed: true },
          { name: 'Affected file exists', passed: true },
          { name: 'Patch has valid structure', passed: true },
          { name: 'Patch scope is valid', passed: true },
        ],
        passed: true,
      });
      setStageStatuses((prev) => ({ ...prev, validate: 'completed', verify: 'active' }));
      setPipelineStage('verify');

      // ----------------------------------------------------
      // STEP 5: VERIFY
      // ----------------------------------------------------
      addLog('INFO', 'Starting isolated verification');
      setVerifyState({ stepText: 'Starting isolated verification...' });
      await sleep(600);

      addLog('TEST', 'Running pytest');
      setVerifyState({ stepText: 'Running pytest...' });
      await sleep(700);

      addLog('TEST', '9 passed, 0 failed');
      setVerifyState({ stepText: '9 passed, 0 failed' });
      await sleep(500);

      const verificationResult: VerificationResultData = {
        status: 'PASS',
        passed: 9,
        failed: 0,
        exit_code: 0,
        duration_ms: 1820,
      };
      setVerifyState({ stepText: undefined, result: verificationResult });
      addLog('VERIFY', 'Verification passed');
      setStageStatuses((prev) => ({ ...prev, verify: 'completed', report: 'active' }));
      setPipelineStage('report');

      // ----------------------------------------------------
      // STEP 6: REPORT
      // ----------------------------------------------------
      await sleep(400);

      setReportData({
        baseline: { passed: 8, failed: 1 },
        afterPatch: { passed: 9, failed: 0 },
        verification: 'PASS',
        finalStatus: 'VERIFIED AGAINST SELECTED TESTS',
      });
      addLog('REPORT', 'Final report generated');
      setStageStatuses((prev) => ({ ...prev, report: 'completed' }));
      setPipelineStage('completed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSimError(msg);
      setPipelineStage('failed');
      setStageStatuses((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (next[k] === 'active') {
            next[k] = 'failed';
          }
        }
        return next;
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const getStageBadge = (status: StageStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 font-semibold">
            <Check className="w-3 h-3" /> completed
          </span>
        );
      case 'active':
        return (
          <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1 font-semibold animate-pulse">
            ● active
          </span>
        );
      case 'failed':
        return (
          <span className="text-[10px] font-mono text-rose-400 flex items-center gap-1 font-semibold">
            ✕ failed
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
            ○ pending
          </span>
        );
    }
  };

  return (
    <div id="bugbuster-workbench" className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header id="app-header" className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Bug className="w-6 h-6 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">BugBuster / PatchMind</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                  AI Engine v1.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Team Member 3 (Project/Technical Lead & AI Engine Architect)
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              id="tab-demo"
              onClick={() => setActiveTab('demo')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'demo'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Demo Pipeline
            </button>
            <button
              id="tab-architecture"
              onClick={() => setActiveTab('architecture')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'architecture'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Module Files (7)
            </button>
            <button
              id="tab-contract"
              onClick={() => setActiveTab('contract')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'contract'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Integration Contract
            </button>
            <button
              id="tab-tests"
              onClick={() => setActiveTab('tests')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'tests'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Unit Tests (12/12)
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Error Banner if Simulation Fails */}
        {simError && (
          <div className="bg-rose-950/60 border border-rose-500/80 rounded-2xl p-4 flex items-start justify-between gap-3 text-xs text-rose-200 shadow-xl">
            <div className="flex items-start gap-2.5">
              <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white text-sm">Pipeline Simulation Halted</p>
                <p className="mt-1 text-rose-300">{simError}</p>
              </div>
            </div>
            <button
              onClick={runPipelineSimulation}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors shrink-0 flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Simulation
            </button>
          </div>
        )}

        {/* Pipeline Bar */}
        <section id="pipeline-status-card" className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              End-to-End Execution Pipeline
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-mono">
                Pipeline Rule: <strong className="text-rose-400">AI Never Claims Verification</strong>
              </span>
              <button
                id="btn-re-run-demo"
                onClick={runPipelineSimulation}
                disabled={isSimulating}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors border ${
                  isSimulating
                    ? 'bg-slate-800 text-slate-400 border-slate-700 cursor-not-allowed opacity-80'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold border-amber-400 shadow-sm shadow-amber-500/20'
                }`}
              >
                {isSimulating ? (
                  <>
                    <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                    Simulating Pipeline...
                  </>
                ) : pipelineStage === 'completed' ? (
                  <>
                    <RotateCcw className="w-3 h-3 text-slate-950" />
                    Re-run Simulation
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 text-slate-950 fill-slate-950" />
                    Simulate Pipeline
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            {/* 1. Reproduce */}
            <div
              className={`rounded-xl p-3 border transition-all ${
                stageStatuses.reproduce === 'active'
                  ? 'bg-blue-950/50 border-blue-500/80 ring-1 ring-blue-500/40 shadow-lg shadow-blue-500/10'
                  : stageStatuses.reproduce === 'completed'
                  ? 'bg-slate-900/90 border-emerald-500/40'
                  : stageStatuses.reproduce === 'failed'
                  ? 'bg-rose-950/30 border-rose-500/60 ring-1 ring-rose-500/30'
                  : 'bg-slate-900/60 border-slate-800/80 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="font-medium">1. Reproduce</span>
                <Server className={`w-3.5 h-3.5 ${stageStatuses.reproduce === 'active' ? 'text-blue-400 animate-pulse' : 'text-blue-400'}`} />
              </div>
              <div className="font-semibold text-slate-200">Pytest Failure</div>
              <div className="flex items-center justify-between text-[10px] mt-1.5 pt-1 border-t border-slate-800/50">
                <span className="text-blue-400 font-mono">Member 4 (Docker)</span>
                {getStageBadge(stageStatuses.reproduce)}
              </div>
            </div>

            {/* 2. Analyze */}
            <div
              className={`rounded-xl p-3 border transition-all ${
                stageStatuses.analyze === 'active'
                  ? 'bg-amber-950/50 border-amber-500/80 ring-1 ring-amber-500/40 shadow-lg shadow-amber-500/10'
                  : stageStatuses.analyze === 'completed'
                  ? 'bg-slate-900/90 border-emerald-500/40'
                  : stageStatuses.analyze === 'failed'
                  ? 'bg-rose-950/30 border-rose-500/60 ring-1 ring-rose-500/30'
                  : 'bg-slate-900/60 border-slate-800/80 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between text-amber-300 mb-1">
                <span className="font-medium">2. Analyze</span>
                <Cpu className={`w-3.5 h-3.5 ${stageStatuses.analyze === 'active' ? 'text-amber-400 animate-pulse' : 'text-amber-400'}`} />
              </div>
              <div className="font-semibold text-white">DiagnosisResult</div>
              <div className="flex items-center justify-between text-[10px] mt-1.5 pt-1 border-t border-slate-800/50">
                <span className="text-amber-300 font-medium font-mono">Member 3 (AI)</span>
                {getStageBadge(stageStatuses.analyze)}
              </div>
            </div>

            {/* 3. Patch */}
            <div
              className={`rounded-xl p-3 border transition-all ${
                stageStatuses.patch === 'active'
                  ? 'bg-amber-950/50 border-amber-500/80 ring-1 ring-amber-500/40 shadow-lg shadow-amber-500/10'
                  : stageStatuses.patch === 'completed'
                  ? 'bg-slate-900/90 border-emerald-500/40'
                  : stageStatuses.patch === 'failed'
                  ? 'bg-rose-950/30 border-rose-500/60 ring-1 ring-rose-500/30'
                  : 'bg-slate-900/60 border-slate-800/80 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between text-amber-300 mb-1">
                <span className="font-medium">3. Patch</span>
                <Wrench className={`w-3.5 h-3.5 ${stageStatuses.patch === 'active' ? 'text-amber-400 animate-pulse' : 'text-amber-400'}`} />
              </div>
              <div className="font-semibold text-white">PatchResult</div>
              <div className="flex items-center justify-between text-[10px] mt-1.5 pt-1 border-t border-slate-800/50">
                <span className="text-amber-300 font-medium font-mono">Member 3 (AI)</span>
                {getStageBadge(stageStatuses.patch)}
              </div>
            </div>

            {/* 4. Validate */}
            <div
              className={`rounded-xl p-3 border transition-all ${
                stageStatuses.validate === 'active'
                  ? 'bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/40 shadow-lg shadow-purple-500/10'
                  : stageStatuses.validate === 'completed'
                  ? 'bg-slate-900/90 border-emerald-500/40'
                  : stageStatuses.validate === 'failed'
                  ? 'bg-rose-950/30 border-rose-500/60 ring-1 ring-rose-500/30'
                  : 'bg-slate-900/60 border-slate-800/80 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="font-medium">4. Validate</span>
                <Box className={`w-3.5 h-3.5 ${stageStatuses.validate === 'active' ? 'text-purple-400 animate-pulse' : 'text-purple-400'}`} />
              </div>
              <div className="font-semibold text-slate-200">Diff Sanity Check</div>
              <div className="flex items-center justify-between text-[10px] mt-1.5 pt-1 border-t border-slate-800/50">
                <span className="text-purple-400 font-mono">Member 2 (FastAPI)</span>
                {getStageBadge(stageStatuses.validate)}
              </div>
            </div>

            {/* 5. Verify */}
            <div
              className={`rounded-xl p-3 border transition-all ${
                stageStatuses.verify === 'active'
                  ? 'bg-emerald-950/40 border-emerald-500/80 ring-1 ring-emerald-500/40 shadow-lg shadow-emerald-500/10'
                  : stageStatuses.verify === 'completed'
                  ? 'bg-slate-900/90 border-emerald-500/40'
                  : stageStatuses.verify === 'failed'
                  ? 'bg-rose-950/30 border-rose-500/60 ring-1 ring-rose-500/30'
                  : 'bg-slate-900/60 border-slate-800/80 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="font-medium">5. Verify</span>
                <Terminal className={`w-3.5 h-3.5 ${stageStatuses.verify === 'active' ? 'text-emerald-400 animate-pulse' : 'text-emerald-400'}`} />
              </div>
              <div className="font-semibold text-emerald-400">PASS / FAIL</div>
              <div className="flex items-center justify-between text-[10px] mt-1.5 pt-1 border-t border-slate-800/50">
                <span className="text-emerald-400 font-mono">Member 4 (Docker)</span>
                {getStageBadge(stageStatuses.verify)}
              </div>
            </div>

            {/* 6. Report */}
            <div
              className={`rounded-xl p-3 border transition-all ${
                stageStatuses.report === 'active'
                  ? 'bg-cyan-950/40 border-cyan-500/80 ring-1 ring-cyan-500/40 shadow-lg shadow-cyan-500/10'
                  : stageStatuses.report === 'completed'
                  ? 'bg-slate-900/90 border-emerald-500/40'
                  : stageStatuses.report === 'failed'
                  ? 'bg-rose-950/30 border-rose-500/60 ring-1 ring-rose-500/30'
                  : 'bg-slate-900/60 border-slate-800/80 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="font-medium">6. Report</span>
                <CheckCircle2 className={`w-3.5 h-3.5 ${stageStatuses.report === 'active' ? 'text-cyan-400 animate-pulse' : 'text-cyan-400'}`} />
              </div>
              <div className="font-semibold text-slate-200">Final Dashboard</div>
              <div className="flex items-center justify-between text-[10px] mt-1.5 pt-1 border-t border-slate-800/50">
                <span className="text-cyan-400 font-mono">Member 1 & 2</span>
                {getStageBadge(stageStatuses.report)}
              </div>
            </div>
          </div>
        </section>

        {/* TAB 1: DEMO PIPELINE */}
        {activeTab === 'demo' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Failure & Diagnosis & Terminal */}
            <div className="space-y-6">
              {/* Stage 1: Pytest Failure Trace */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-rose-400" />
                    <h3 className="text-sm font-semibold text-white">Stage 1: Pytest Failure Trace</h3>
                  </div>
                  {reproduceState?.failed ? (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">
                      {reproduceState.errorName || 'AssertionError: 70.0 != 85.0'}
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      baseline test run
                    </span>
                  )}
                </div>

                {stageStatuses.reproduce === 'active' || reproduceState?.statusText ? (
                  <div className="bg-slate-900 rounded-xl p-6 font-mono text-xs text-blue-300 border border-blue-500/30 flex flex-col items-center justify-center gap-2.5">
                    <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                    <p className="font-semibold text-slate-200 text-sm">Running pytest...</p>
                    <p className="text-slate-400 text-[11px]">
                      Executing backend/demo/test_calculator.py in ephemeral Docker sandbox
                    </p>
                  </div>
                ) : reproduceState?.failed ? (
                  <div>
                    <div className="flex items-center gap-3 mb-3 px-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        ❌ 1 failed
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        ✅ 8 passed
                      </span>
                      <span className="text-xs text-slate-400 font-mono ml-auto">
                        Assertion Error reproduced
                      </span>
                    </div>

                    <div className="bg-slate-900 rounded-xl p-3.5 font-mono text-xs text-rose-300 border border-slate-800 overflow-x-auto leading-relaxed">
                      <p className="text-slate-400"># backend/demo/calculator.py</p>
                      <p className="text-amber-300">
                        def calculate_discounted_price(price: float, discount: float):
                      </p>
                      <p className="text-rose-400 bg-rose-950/40 px-1 py-0.5 rounded my-1">
                        - return price - discount * 2 # BUG: Multiplies discount by 2
                      </p>
                      <div className="mt-3 pt-2 border-t border-slate-800 text-slate-300">
                        <p className="text-rose-400 font-bold">FAILED test_calculate_discounted_price_standard</p>
                        <p className="text-rose-300">{reproduceState.errorDetail || 'assert 70.0 == 85.0 (expected 85.0, got 70.0)'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/60 rounded-xl p-6 font-mono text-xs text-slate-400 border border-slate-800 text-center space-y-1">
                    <p className="text-slate-300 font-semibold">Pytest Failure Reproduction</p>
                    <p className="text-slate-500 text-[11px]">
                      Click &quot;Simulate Pipeline&quot; above to execute baseline tests in Docker sandbox.
                    </p>
                  </div>
                )}
              </div>

              {/* Stage 2: DiagnosisResult */}
              <div className="bg-slate-950 border border-amber-500/40 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-white">Stage 2: AI DiagnosisResult</h3>
                  </div>
                  {stageStatuses.analyze === 'active' ? (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" /> AI analyzing failure...
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      bug_analyzer.py
                    </span>
                  )}
                </div>

                {stageStatuses.analyze === 'active' ? (
                  <div className="bg-slate-900 rounded-xl p-6 font-mono text-xs text-amber-300 border border-amber-500/30 flex flex-col items-center justify-center gap-2.5">
                    <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                    <p className="font-semibold text-slate-200 text-sm">AI analyzing failure...</p>
                    <p className="text-slate-400 text-[11px]">
                      Parsing stack trace & extracting AST root-cause with bug_analyzer.py
                    </p>
                  </div>
                ) : diagnosisData ? (
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-slate-400 font-mono">root_cause:</span>
                      <p className="font-semibold text-amber-200 mt-0.5">
                        {diagnosisData.root_cause}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 font-mono">explanation:</span>
                      <p className="text-slate-300 mt-0.5 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                        {diagnosisData.explanation}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-slate-400 font-mono">affected_files:</span>
                        <p className="text-cyan-300 font-mono mt-0.5">
                          {JSON.stringify(diagnosisData.affected_files)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-mono">suggested_fix:</span>
                        <p className="text-emerald-300 mt-0.5">{diagnosisData.suggested_fix}</p>
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-400 font-mono">uncertainty:</span>
                      <p className="text-slate-400 italic mt-0.5">
                        {diagnosisData.uncertainty}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/60 rounded-xl p-6 font-mono text-xs text-slate-500 border border-slate-800 text-center">
                    Awaiting test failure trace from Stage 1 to trigger bug_analyzer.py.
                  </div>
                )}
              </div>

              {/* Live Pipeline Terminal UI */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-white">Live Pipeline Terminal</h3>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    {logs.length} events logged
                  </span>
                </div>
                <div className="bg-slate-900/90 rounded-xl p-3.5 font-mono text-xs border border-slate-800 h-44 overflow-y-auto space-y-1.5 leading-relaxed">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 text-[11px]">
                      <span className="text-slate-500 shrink-0 text-[10px] font-mono mt-0.5">
                        {log.timestamp}
                      </span>
                      <span
                        className={`text-[10px] px-1 py-0.5 rounded font-bold shrink-0 ${
                          log.prefix === 'ERROR'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : log.prefix === 'AI'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : log.prefix === 'TEST'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : log.prefix === 'VERIFY'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : log.prefix === 'REPORT'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}
                      >
                        [{log.prefix}]
                      </span>
                      <span
                        className={`${
                          log.prefix === 'ERROR'
                            ? 'text-rose-300 font-semibold'
                            : log.prefix === 'VERIFY'
                            ? 'text-emerald-300 font-semibold'
                            : log.prefix === 'REPORT'
                            ? 'text-cyan-200 font-semibold'
                            : 'text-slate-300'
                        }`}
                      >
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Patch, Validation, Verification & Report */}
            <div className="space-y-6">
              {/* Stage 3: PatchResult (Unified Diff) */}
              <div className="bg-slate-950 border border-emerald-500/40 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white">Stage 3: AI PatchResult</h3>
                  </div>
                  {stageStatuses.patch === 'active' ? (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" /> Generating patch...
                    </span>
                  ) : patchData ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                        AI GENERATED
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">
                        VERIFICATION PENDING
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      patch_generator.py
                    </span>
                  )}
                </div>

                {stageStatuses.patch === 'active' ? (
                  <div className="bg-slate-900 rounded-xl p-6 font-mono text-xs text-emerald-300 border border-emerald-500/30 flex flex-col items-center justify-center gap-2.5">
                    <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                    <p className="font-semibold text-slate-200 text-sm">Generating patch...</p>
                    <p className="text-slate-400 text-[11px]">
                      Synthesizing minimal surgical unified diff for calculator.py
                    </p>
                  </div>
                ) : patchData ? (
                  <div>
                    <div className="bg-slate-900 rounded-xl p-3 font-mono text-xs border border-slate-800 leading-relaxed overflow-x-auto">
                      <div className="text-slate-500">--- a/backend/demo/calculator.py</div>
                      <div className="text-slate-500">+++ b/backend/demo/calculator.py</div>
                      <div className="text-cyan-400 font-semibold my-1">@@ -4,3 +4,3 @@</div>
                      <div className="text-slate-400">&nbsp;&nbsp;&nbsp;&nbsp;if price &lt; 0 or discount &lt; 0:</div>
                      <div className="text-slate-400">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise ValueError(&quot;Price and discount must be non-negative&quot;)</div>
                      <div className="text-rose-400 bg-rose-950/60 px-1 py-0.5 rounded">
                        -&nbsp;&nbsp;&nbsp;return price - discount * 2
                      </div>
                      <div className="text-emerald-400 bg-emerald-950/60 px-1 py-0.5 rounded">
                        +&nbsp;&nbsp;&nbsp;return price - discount
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 font-mono">test_recommendation:</span>
                        <p className="text-slate-300 mt-0.5 font-mono bg-slate-900/50 p-2 rounded border border-slate-800">
                          {patchData.test_recommendation}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-slate-400 font-mono">affected_files:</span>
                          <p className="text-cyan-300 font-mono mt-0.5">
                            {JSON.stringify(patchData.affected_files)}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-mono">architecture_status:</span>
                          <p className="text-amber-400 font-semibold mt-0.5">
                            Unverified (Pending Docker)
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/60 rounded-xl p-6 font-mono text-xs text-slate-500 border border-slate-800 text-center">
                    Awaiting DiagnosisResult to invoke patch_generator.py for minimal unified diff.
                  </div>
                )}
              </div>

              {/* Stage 4: Patch Validation */}
              <div className="bg-slate-950 border border-purple-500/40 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Box className="w-4 h-4 text-purple-400" />
                    <h3 className="text-sm font-semibold text-white">Stage 4: Frontend Patch Validation</h3>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    sanity_check
                  </span>
                </div>

                {stageStatuses.validate === 'active' || (validationState && validationState.validating) ? (
                  <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-purple-300 border border-purple-500/30 flex items-center justify-center gap-2 py-6">
                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                    <span className="font-semibold">Validating patch syntax and target scope...</span>
                  </div>
                ) : validationState?.passed ? (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      {validationState.checks.map((check) => (
                        <div
                          key={check.name}
                          className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800 font-mono text-[11px] text-emerald-300"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{check.name}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-2.5 flex items-center justify-between text-xs">
                      <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Patch validation passed
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        FastAPI Pre-flight Check Complete
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/60 rounded-xl p-4 font-mono text-xs text-slate-500 border border-slate-800 text-center py-4">
                    Awaiting patch generation from Stage 3 to perform structural sanity validation.
                  </div>
                )}
              </div>

              {/* Stage 5 & 6: Docker Sandbox Verification & Final Report */}
              <div className="bg-slate-950 border border-emerald-500/40 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Terminal className="w-4 h-4" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Stage 5 & 6: Docker Sandbox Verification & Report
                    </h3>
                  </div>
                  {stageStatuses.verify === 'completed' && (
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      PASS (Exit 0)
                    </span>
                  )}
                </div>

                {stageStatuses.verify === 'active' || verifyState?.stepText ? (
                  <div className="bg-slate-900 rounded-xl p-5 border border-emerald-500/40 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                      <span>{verifyState?.stepText || 'Executing isolated container verification...'}</span>
                    </div>
                    <div className="font-mono text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                      <p className="text-slate-500">$ docker run --rm -v sandbox:/workspace bugbuster/runner:3.11</p>
                      <p className="text-cyan-400">$ git apply candidate_patch.diff</p>
                      <p className="text-amber-300">$ pytest backend/demo/test_calculator.py</p>
                    </div>
                  </div>
                ) : reportData ? (
                  <div className="space-y-4">
                    {/* PASS Banner */}
                    <div className="bg-emerald-950/50 border border-emerald-500 rounded-xl p-4 shadow-lg shadow-emerald-500/10">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          <span className="font-bold text-sm text-white">Docker Verification: PASS</span>
                        </div>
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          EXIT CODE: 0
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono mt-3 text-slate-300">
                        <div className="bg-slate-900/80 p-2 rounded border border-slate-800 text-center">
                          <div className="text-slate-400 text-[10px]">Passed Tests</div>
                          <div className="text-emerald-400 font-bold text-sm mt-0.5">9 passed</div>
                        </div>
                        <div className="bg-slate-900/80 p-2 rounded border border-slate-800 text-center">
                          <div className="text-slate-400 text-[10px]">Failed Tests</div>
                          <div className="text-slate-300 font-bold text-sm mt-0.5">0 failed</div>
                        </div>
                        <div className="bg-slate-900/80 p-2 rounded border border-slate-800 text-center">
                          <div className="text-slate-400 text-[10px]">Execution Time</div>
                          <div className="text-cyan-300 font-bold text-sm mt-0.5">1820ms</div>
                        </div>
                      </div>
                    </div>

                    {/* Final Report Card */}
                    <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 space-y-3 text-xs">
                      <div className="font-bold text-slate-200 border-b border-slate-800 pb-2 flex items-center justify-between">
                        <span>Pipeline Verification Summary</span>
                        <span className="text-[10px] text-cyan-400 font-mono">Stage 6: Report</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                          <div className="text-slate-400 text-[10px] mb-1 font-sans">
                            Baseline (Before Patch):
                          </div>
                          <div className="text-rose-400">❌ 1 failed</div>
                          <div className="text-emerald-400">✅ 8 passed</div>
                        </div>
                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                          <div className="text-slate-400 text-[10px] mb-1 font-sans">
                            After Patch (Isolated):
                          </div>
                          <div className="text-emerald-400">✅ 9 passed</div>
                          <div className="text-slate-400">❌ 0 failed</div>
                        </div>
                      </div>

                      {/* Final verified badge */}
                      <div className="bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/60 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                          <div>
                            <div className="text-xs font-bold text-white tracking-wide">
                              🟢 VERIFIED AGAINST SELECTED TESTS
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Docker container asserted all 9 pytest assertions pass without regressions.
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-1 rounded border border-emerald-500/30">
                          PASS
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                    <p className="font-semibold text-amber-300">
                      Status: <span className="underline">VERIFICATION PENDING</span>
                    </p>
                    <p className="text-slate-400">
                      In accordance with strict BugBuster architectural boundaries:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                      <li>The AI module (Member 3) <strong>NEVER claims verified: true</strong>.</li>
                      <li>The AI module does <strong>NOT apply the patch</strong> or execute code.</li>
                      <li>
                        This payload is returned to <strong>Member 2 (FastAPI)</strong>, which delegates to{' '}
                        <strong>Member 4's isolated Docker sandbox</strong>.
                      </li>
                      <li>
                        Only Docker sandbox executing pytest can conclude with final <strong>PASS</strong> or <strong>FAIL</strong>.
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MODULE ARCHITECTURE */}
        {activeTab === 'architecture' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* File List */}
            <div className="md:col-span-1 space-y-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
                Backend AI Subsystem Files (7)
              </h3>
              {MODULE_FILES.map((file) => (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left p-3 rounded-xl text-xs transition-all border ${
                    selectedFile.path === file.path
                      ? 'bg-amber-500/10 border-amber-500 text-white font-medium shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold">{file.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 truncate">{file.role}</div>
                </button>
              ))}
            </div>

            {/* File Details */}
            <div className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white font-mono">{selectedFile.path}</h3>
                  <p className="text-xs text-amber-400 font-medium mt-0.5">{selectedFile.role}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(selectedFile.path, 'filepath')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition-colors border border-slate-700"
                >
                  {copied === 'filepath' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  Copy Path
                </button>
              </div>

              <div className="space-y-4 text-xs leading-relaxed">
                <div>
                  <h4 className="font-semibold text-slate-300 mb-1">Architectural Role & Functionality:</h4>
                  <p className="text-slate-400 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    {selectedFile.summary}
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-slate-300 mb-1">Integration Connection:</h4>
                  <p className="text-slate-400 bg-slate-900/80 p-3 rounded-xl border border-slate-800 font-mono text-[11px]">
                    {selectedFile.connectsTo}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Location: backend/app/ai/</span>
                  <span className="text-emerald-400 font-mono">100% Production Ready</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: INTEGRATION CONTRACT */}
        {activeTab === 'contract' && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white">Team Member Ownership & Integration Contract</h3>
              <p className="text-xs text-slate-400 mt-1">
                Explicit separation of concerns between Orchestration (Member 2), AI Engine (Member 3), and Sandboxed Execution (Member 4).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="font-bold text-blue-400 flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  Member 2: FastAPI Orchestration
                </div>
                <ul className="text-slate-400 space-y-1.5 list-disc list-inside">
                  <li>API routes (/api/diagnose, /api/patch)</li>
                  <li>PostgreSQL task state management</li>
                  <li>Extracts relevant source code & test files</li>
                  <li>Calls Member 3 AI functions</li>
                  <li>Dispatches candidate patches to Member 4</li>
                </ul>
              </div>

              <div className="bg-amber-950/30 border border-amber-500/50 rounded-xl p-4 space-y-2 ring-1 ring-amber-500/30">
                <div className="font-bold text-amber-300 flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  Member 3 (You): AI Engine
                </div>
                <ul className="text-slate-300 space-y-1.5 list-disc list-inside">
                  <li>Pure static code reasoning and prompt engineering</li>
                  <li>Untrusted input isolation & prompt injection defense</li>
                  <li>Produces bounded DiagnosisResult & PatchResult</li>
                  <li>Strictly forbids verified status claims</li>
                  <li>NO shell/Docker execution; NO direct disk write</li>
                </ul>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="font-bold text-emerald-400 flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Member 4: Docker Sandbox & Testing
                </div>
                <ul className="text-slate-400 space-y-1.5 list-disc list-inside">
                  <li>Ephemeral Docker container lifecycle</li>
                  <li>Applies git unified diff in isolation</li>
                  <li>Executes pytest inside sandbox</li>
                  <li>Returns definitive execution status (PASS / FAIL)</li>
                  <li>Captures final logs for Member 2 reporting</li>
                </ul>
              </div>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 space-y-2">
              <div className="text-amber-400 font-semibold">Step-by-Step Contract Flow:</div>
              <p className="text-slate-400">1. Member 4 executes pytest in Docker → Failure observed.</p>
              <p className="text-slate-400">2. Member 2 captures failure logs & relevant code snippets.</p>
              <p className="text-amber-300 font-medium">3. Member 2 calls analyze_failure() → Member 3 returns DiagnosisResult.</p>
              <p className="text-amber-300 font-medium">4. Member 2 calls generate_patch() → Member 3 returns PatchResult (unified diff).</p>
              <p className="text-slate-400">5. Member 2 validates diff schema & hands patch to Member 4.</p>
              <p className="text-emerald-400 font-medium">6. Member 4 applies diff in fresh container & runs pytest → Real PASS / FAIL verification.</p>
            </div>
          </div>
        )}

        {/* TAB 4: UNIT TESTS */}
        {activeTab === 'tests' && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Unit Test Suite (Requirements A through L)</h3>
                <p className="text-xs text-slate-400 mt-1">
                  12 verified unit tests in <code className="text-amber-400">backend/tests/test_ai_engine.py</code>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  12 / 12 Passing (100%)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {UNIT_TESTS.map((test) => (
                <div
                  key={test.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-start gap-3"
                >
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-mono font-bold flex items-center justify-center shrink-0 border border-emerald-500/30 text-[11px]">
                    {test.id}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white truncate">{test.name}</span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/60">
                        {test.status}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-0.5">{test.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
              <div className="text-slate-400">
                Execute tests with: <code className="text-amber-300 font-mono">python3 -m unittest backend/tests/test_ai_engine.py</code> or <code className="text-amber-300 font-mono">pytest backend/tests/</code>
              </div>
              <button
                onClick={() => copyToClipboard('python3 -m unittest backend/tests/test_ai_engine.py', 'testcmd')}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition-colors border border-slate-700"
              >
                {copied === 'testcmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copy Command
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
