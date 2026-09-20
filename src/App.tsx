import React, { useState } from 'react';
import { Header } from './components/Header';
import { Navigation, ActiveTab } from './components/Navigation';
import { PipelineControl } from './components/PipelineControl';
import { Stage1Reproduce } from './components/stages/Stage1Reproduce';
import { Stage2Analyze } from './components/stages/Stage2Analyze';
import { Stage3Patch } from './components/stages/Stage3Patch';
import { Stage4Validate } from './components/stages/Stage4Validate';
import { Stage5Verify } from './components/stages/Stage5Verify';
import { Stage6Report } from './components/stages/Stage6Report';
import { TerminalLogs } from './components/TerminalLogs';
import { RunHistoryTab } from './components/tabs/RunHistoryTab';
import { ModuleFilesTab } from './components/tabs/ModuleFilesTab';
import { IntegrationContractTab } from './components/tabs/IntegrationContractTab';
import { UnitTestsTab } from './components/tabs/UnitTestsTab';
import { DiffModal } from './components/modals/DiffModal';
import { TestOutputModal } from './components/modals/TestOutputModal';
import {
  PipelineStage,
  StageState,
  SimulationScenario,
  DiagnosisResultData,
  PatchResultData,
  ValidationStateData,
  VerificationResultData,
  ReportData,
  LogEntry,
  RunHistoryItem,
} from './types';
import { VALIDATION_CHECKS_SPEC } from './data/mockData';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const INITIAL_STAGE_STATES: Record<string, StageState> = {
  reproduce: 'PENDING',
  analyze: 'PENDING',
  patch: 'PENDING',
  validate: 'PENDING',
  verify: 'PENDING',
  report: 'PENDING',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('demo');
  const [scenario, setScenario] = useState<SimulationScenario>('success');

  // Pipeline State
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>('idle');
  const [stageStates, setStageStates] = useState<Record<string, StageState>>(INITIAL_STAGE_STATES);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Stage Data
  const [stage1Error, setStage1Error] = useState<{
    passed: number;
    failed: number;
    errorName: string;
    expected: string;
    actual: string;
  } | null>(null);
  const [stage2Diagnosis, setStage2Diagnosis] = useState<DiagnosisResultData | null>(null);
  const [stage3Patch, setStage3Patch] = useState<PatchResultData | null>(null);
  const [stage4Validation, setStage4Validation] = useState<ValidationStateData | null>(null);
  const [stage5Verification, setStage5Verification] = useState<VerificationResultData | null>(null);
  const [stage5StepMsg, setStage5StepMsg] = useState<string | undefined>(undefined);
  const [stage6Report, setStage6Report] = useState<ReportData | null>(null);

  // Modals
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [testOutputModalOpen, setTestOutputModalOpen] = useState(false);

  // Progressive Logs
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      timestamp: '01:21:01',
      prefix: 'INFO',
      message: 'PatchMind AI Engine initialized in demo workbench mode.',
    },
    {
      id: 'init-2',
      timestamp: '01:21:02',
      prefix: 'INFO',
      message: 'System ready. Click "▶ Simulate Pipeline" to execute the 6-stage verification flow.',
    },
  ]);

  const addLog = (prefix: LogEntry['prefix'], message: string) => {
    const now = new Date();
    const timeStr =
      String(now.getHours()).padStart(2, '0') +
      ':' +
      String(now.getMinutes()).padStart(2, '0') +
      ':' +
      String(now.getSeconds()).padStart(2, '0');
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

  const handleClearLogs = () => {
    setLogs([]);
  };

  const runPipelineSimulation = async () => {
    if (isSimulating) return;

    setIsSimulating(true);
    setSimError(null);
    setPipelineStage('reproduce');
    setStageStates({
      reproduce: 'RUNNING',
      analyze: 'PENDING',
      patch: 'PENDING',
      validate: 'PENDING',
      verify: 'PENDING',
      report: 'PENDING',
    });

    // Reset stage states
    setStage1Error(null);
    setStage2Diagnosis(null);
    setStage3Patch(null);
    setStage4Validation(null);
    setStage5Verification(null);
    setStage5StepMsg(undefined);
    setStage6Report(null);

    try {
      // ----------------------------------------------------
      // STAGE 1: REPRODUCE (Docker Sandbox)
      // ----------------------------------------------------
      addLog('INFO', 'RUN CREATED: RUN-1025 on branch main');
      addLog('DOCKER', 'BASELINE TEST STARTED: mounting test_calculator.py in container');
      await sleep(1000);

      addLog('ERROR', '1 FAILURE DETECTED: AssertionError in test_calculate_discounted_price_standard');
      addLog('ERROR', 'AssertionError: 70.0 != 85.0 (expected: 85.0, actual: 70.0)');
      setStage1Error({
        passed: 8,
        failed: 1,
        errorName: 'AssertionError: 70.0 != 85.0',
        expected: '85.0',
        actual: '70.0',
      });
      setStageStates((prev) => ({ ...prev, reproduce: 'PASSED', analyze: 'RUNNING' }));
      setPipelineStage('analyze');

      // ----------------------------------------------------
      // STAGE 2: ANALYZE (AI Engine)
      // ----------------------------------------------------
      addLog('AI', 'AI ANALYSIS STARTED: packaging bounded failure trace and AST into prompt');
      await sleep(1400);

      const diagnosis: DiagnosisResultData = {
        root_cause: 'The discount is multiplied by 2 before subtraction.',
        explanation:
          'In calculate_discounted_price, line 5 calculates "price - discount * 2". Because multiplication has higher operator precedence and multiplies discount by 2, deduction is doubled.',
        affected_files: ['backend/demo/calculator.py'],
        suggested_fix: 'Subtract discount once without multiplying by 2: "return price - discount"',
        uncertainty: 'Diagnosis is based strictly on the supplied failing test and calculator.py AST.',
        confidence: 98,
        expected_calc: '100 - 15 = 85',
        actual_calc: '100 - (15 × 2) = 70',
      };
      setStage2Diagnosis(diagnosis);
      addLog('AI', 'ROOT CAUSE IDENTIFIED: Discount multiplied by 2 before subtraction (98% confidence)');
      setStageStates((prev) => ({ ...prev, analyze: 'PASSED', patch: 'RUNNING' }));
      setPipelineStage('patch');

      // ----------------------------------------------------
      // STAGE 3: PATCH (AI Engine)
      // ----------------------------------------------------
      addLog('AI', 'PATCH GENERATION STARTED: synthesizing minimal surgical unified diff');
      await sleep(1300);

      const isFailingScenario = scenario === 'failure';
      const patchDiff = isFailingScenario
        ? `--- a/backend/demo/calculator.py
+++ b/backend/demo/calculator.py
@@ -4,3 +4,3 @@
     if price < 0 or discount < 0:
         raise ValueError("Price and discount must be non-negative")
-    return price - discount * 2
+    return price - (discount / 2)`
        : `--- a/backend/demo/calculator.py
+++ b/backend/demo/calculator.py
@@ -4,3 +4,3 @@
     if price < 0 or discount < 0:
         raise ValueError("Price and discount must be non-negative")
-    return price - discount * 2
+    return price - discount`;

      const patch: PatchResultData = {
        patch: patchDiff,
        affected_files: ['backend/demo/calculator.py'],
        test_recommendation: 'pytest tests/test_calculator.py',
        uncertainty: 'Patch does not modify any function signatures or dependencies.',
        patch_type: 'Minimal Fix',
        unrelated_changes: 0,
      };
      setStage3Patch(patch);
      addLog('AI', 'PATCH GENERATED: [AI GENERATED • VERIFICATION PENDING]');
      setStageStates((prev) => ({ ...prev, patch: 'PASSED', validate: 'RUNNING' }));
      setPipelineStage('validate');

      // ----------------------------------------------------
      // STAGE 4: VALIDATE (FastAPI Validation)
      // ----------------------------------------------------
      addLog('VALIDATE', 'PATCH VALIDATION STARTED: running FastAPI pre-flight security checks');
      setStage4Validation({
        validating: true,
        checks: VALIDATION_CHECKS_SPEC.map((c) => ({ ...c, passed: true })),
        passed: false,
        badge_text: 'VALIDATING',
      });
      await sleep(1100);

      setStage4Validation({
        validating: false,
        checks: VALIDATION_CHECKS_SPEC.map((c) => ({ ...c, passed: true })),
        passed: true,
        badge_text: 'PATCH ACCEPTED FOR SANDBOX',
      });
      addLog('VALIDATE', 'PATCH VALIDATION PASSED: 7/7 security & format checks verified. Dispatching to Docker.');
      setStageStates((prev) => ({ ...prev, validate: 'PASSED', verify: 'RUNNING' }));
      setPipelineStage('verify');

      // ----------------------------------------------------
      // STAGE 5: VERIFY (Docker Sandbox)
      // ----------------------------------------------------
      addLog('DOCKER', 'DOCKER SANDBOX STARTED: container patchmind-runner initialized');
      setStage5StepMsg('Spinning up isolated Docker container (network: restricted)...');
      await sleep(600);

      addLog('DOCKER', 'PATCH APPLIED: candidate patch merged into container workspace');
      setStage5StepMsg('Applied candidate patch in container. Launching pytest suite...');
      await sleep(700);

      addLog('TEST', 'PYTEST COMPLETED inside container');

      if (!isFailingScenario) {
        // Successful verification
        addLog('TEST', '9 PASSED / 0 FAILED');
        addLog('VERIFY', 'VERIFICATION PASSED: Docker container asserted all 9 pytest assertions pass without regressions.');

        const verificationResult: VerificationResultData = {
          status: 'PASS',
          passed: 9,
          failed: 0,
          exit_code: 0,
          duration_s: 1.82,
          container: 'patchmind-runner',
          runtime: 'Python 3.11',
          framework: 'pytest',
          network: 'Restricted',
          output_snippet: '9 passed in 1.82s',
        };
        setStage5Verification(verificationResult);
        setStageStates((prev) => ({ ...prev, verify: 'PASSED', report: 'RUNNING' }));
      } else {
        // Failed verification scenario (Section 10)
        addLog('ERROR', '1 FAILED / 8 PASSED: Flawed patch produced test regression');
        addLog('VERIFY', 'VERIFICATION FAILED: Tests failed inside Docker container. Fix rejected.');

        const verificationResult: VerificationResultData = {
          status: 'FAIL',
          passed: 8,
          failed: 1,
          exit_code: 1,
          duration_s: 1.95,
          container: 'patchmind-runner',
          runtime: 'Python 3.11',
          framework: 'pytest',
          network: 'Restricted',
          output_snippet: '1 failed, 8 passed in 1.95s (AssertionError: 92.5 != 85.0)',
        };
        setStage5Verification(verificationResult);
        setStageStates((prev) => ({ ...prev, verify: 'FAILED', report: 'RUNNING' }));
      }

      setPipelineStage('report');

      // ----------------------------------------------------
      // STAGE 6: REPORT (Verification Report)
      // ----------------------------------------------------
      await sleep(500);

      const finalReport: ReportData = {
        bug_summary:
          'calculator.py doubled discount subtraction by multiplying discount by 2 (line 5), causing calculate_discounted_price(100.0, 15.0) to return 70.0 instead of 85.0.',
        root_cause: 'The discount is multiplied by 2 before subtraction.',
        patch_summary:
          isFailingScenario
            ? 'Candidate diff replaced formula with (discount / 2) which failed pytest verification.'
            : 'Minimal single-line patch: replaced "return price - discount * 2" with "return price - discount".',
        baseline: { passed: 8, failed: 1 },
        after_patch: isFailingScenario ? { passed: 8, failed: 1 } : { passed: 9, failed: 0 },
        verification: isFailingScenario ? 'FAIL' : 'PASS',
        verified_by: 'Docker Sandbox',
        framework: 'pytest',
        exit_code: isFailingScenario ? 1 : 0,
        final_status: isFailingScenario ? 'VERIFICATION FAILED' : 'VERIFIED AGAINST SELECTED TESTS',
      };
      setStage6Report(finalReport);
      addLog('REPORT', 'REPORT GENERATED: Final verification evidence report compiled.');

      setStageStates((prev) => ({
        ...prev,
        report: isFailingScenario ? 'FAILED' : 'PASSED',
      }));
      setPipelineStage(isFailingScenario ? 'failed' : 'completed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSimError(msg);
      setPipelineStage('failed');
      addLog('ERROR', `Pipeline simulation halted: ${msg}`);
    } finally {
      setIsSimulating(false);
      setStage5StepMsg(undefined);
    }
  };

  const handleLoadRunFromHistory = (run: RunHistoryItem) => {
    setActiveTab('demo');
    setScenario(run.scenario);
    // Auto-trigger simulation or load state
    setTimeout(() => {
      runPipelineSimulation();
    }, 150);
  };

  return (
    <div id="patchmind-workbench" className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header systemReady={true} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="text-xs font-mono text-slate-400 hidden sm:block">
            Target: <span className="text-amber-400 font-semibold">patchmind/demo-store</span>
          </div>
        </div>

        {/* TAB 1: DEMO PIPELINE */}
        {activeTab === 'demo' && (
          <div className="space-y-6">
            {/* Error Banner if any */}
            {simError && (
              <div className="bg-rose-950/60 border border-rose-500 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-rose-200 shadow-xl">
                <div>
                  <p className="font-bold text-white text-sm">Pipeline Simulation Halted</p>
                  <p className="mt-1 text-rose-300">{simError}</p>
                </div>
                <button
                  onClick={runPipelineSimulation}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs"
                >
                  Retry Simulation
                </button>
              </div>
            )}

            {/* Pipeline Control Panel with 6 Connected Stages */}
            <PipelineControl
              pipelineStage={pipelineStage}
              stageStates={stageStates}
              isSimulating={isSimulating}
              onSimulate={runPipelineSimulation}
              scenario={scenario}
              onScenarioChange={setScenario}
            />

            {/* Main Stage Grid: Left Column (Stage 1, 2, Logs) | Right Column (Stage 3, 4, 5, 6) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left Column */}
              <div className="space-y-6">
                {/* Stage 1: Reproduce */}
                <Stage1Reproduce
                  status={
                    stageStates.reproduce === 'RUNNING'
                      ? 'running'
                      : stageStates.reproduce === 'PASSED'
                      ? 'completed'
                      : 'pending'
                  }
                  errorDetails={stage1Error}
                />

                {/* Stage 2: Analyze */}
                <Stage2Analyze
                  status={
                    stageStates.analyze === 'RUNNING'
                      ? 'running'
                      : stageStates.analyze === 'PASSED'
                      ? 'completed'
                      : 'pending'
                  }
                  data={stage2Diagnosis}
                />

                {/* Real-time Progressive Event Stream */}
                <TerminalLogs logs={logs} onClear={handleClearLogs} />
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Stage 3: Patch */}
                <Stage3Patch
                  status={
                    stageStates.patch === 'RUNNING'
                      ? 'running'
                      : stageStates.patch === 'PASSED'
                      ? 'completed'
                      : 'pending'
                  }
                  data={stage3Patch}
                />

                {/* Stage 4: Validate */}
                <Stage4Validate
                  status={
                    stageStates.validate === 'RUNNING'
                      ? 'running'
                      : stageStates.validate === 'PASSED'
                      ? 'completed'
                      : 'pending'
                  }
                  data={stage4Validation}
                />

                {/* Stage 5: Docker Sandbox Verification (Most Visually Prominent) */}
                <Stage5Verify
                  status={
                    stageStates.verify === 'RUNNING'
                      ? 'running'
                      : stageStates.verify === 'PASSED' || stageStates.verify === 'FAILED'
                      ? 'completed'
                      : 'pending'
                  }
                  data={stage5Verification}
                  stepMessage={stage5StepMsg}
                />

                {/* Stage 6: Verification Report */}
                <Stage6Report
                  status={
                    stageStates.report === 'RUNNING'
                      ? 'running'
                      : stageStates.report === 'PASSED' || stageStates.report === 'FAILED'
                      ? 'completed'
                      : 'pending'
                  }
                  report={stage6Report}
                  onViewDiff={() => setDiffModalOpen(true)}
                  onViewTestOutput={() => setTestOutputModalOpen(true)}
                  onViewLogs={() => {
                    const el = document.getElementById('terminal-logs-panel');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MODULE FILES */}
        {activeTab === 'files' && <ModuleFilesTab />}

        {/* TAB 3: INTEGRATION CONTRACT */}
        {activeTab === 'contract' && <IntegrationContractTab />}

        {/* TAB 4: UNIT TESTS */}
        {activeTab === 'tests' && <UnitTestsTab />}

        {/* TAB 5: RUN HISTORY */}
        {activeTab === 'history' && (
          <RunHistoryTab onLoadRun={handleLoadRunFromHistory} />
        )}
      </main>

      {/* Modals */}
      <DiffModal
        isOpen={diffModalOpen}
        onClose={() => setDiffModalOpen(false)}
        diff={
          stage3Patch?.patch ||
          `--- a/backend/demo/calculator.py
+++ b/backend/demo/calculator.py
@@ -4,3 +4,3 @@
     if price < 0 or discount < 0:
         raise ValueError("Price and discount must be non-negative")
-    return price - discount * 2
+    return price - discount`
        }
      />

      <TestOutputModal
        isOpen={testOutputModalOpen}
        onClose={() => setTestOutputModalOpen(false)}
        isPassing={stage5Verification?.status !== 'FAIL'}
      />
    </div>
  );
}
