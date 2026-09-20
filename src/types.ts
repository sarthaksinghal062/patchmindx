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

export type StageState = 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'SKIPPED';

export type SimulationScenario = 'success' | 'failure';

export interface DiagnosisResultData {
  root_cause: string;
  explanation: string;
  affected_files: string[];
  suggested_fix: string;
  uncertainty: string;
  confidence: number;
  expected_calc: string;
  actual_calc: string;
}

export interface PatchResultData {
  patch: string;
  affected_files: string[];
  test_recommendation: string;
  uncertainty: string;
  patch_type: string;
  unrelated_changes: number;
}

export interface ValidationCheck {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export interface ValidationStateData {
  validating: boolean;
  checks: ValidationCheck[];
  passed: boolean;
  badge_text: string;
}

export interface VerificationResultData {
  status: 'PASS' | 'FAIL';
  passed: number;
  failed: number;
  exit_code: number;
  duration_s: number;
  container: string;
  runtime: string;
  framework: string;
  network: string;
  output_snippet: string;
}

export interface ReportData {
  bug_summary: string;
  root_cause: string;
  patch_summary: string;
  baseline: { passed: number; failed: number };
  after_patch: { passed: number; failed: number };
  verification: 'PASS' | 'FAIL';
  verified_by: string;
  framework: string;
  exit_code: number;
  final_status: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  prefix: 'INFO' | 'ERROR' | 'AI' | 'VALIDATE' | 'DOCKER' | 'TEST' | 'VERIFY' | 'REPORT';
  message: string;
}

export interface ModuleFileSpec {
  path: string;
  name: string;
  role: string;
  connectsTo: string;
  summary: string;
  code: string;
}

export interface UnitTestSpec {
  id: string;
  name: string;
  status: 'PASS' | 'FAIL';
  desc: string;
  category: string;
}

export interface RunHistoryItem {
  id: string;
  repo: string;
  bug: string;
  status: 'COMPLETED' | 'FAILED';
  tests: string;
  verification: 'VERIFIED' | 'VERIFICATION FAILED';
  duration: string;
  created: string;
  scenario: SimulationScenario;
  exit_code: number;
}
