import React from 'react';
import {
  ArrowDown,
  ArrowRight,
  Server,
  Cpu,
  Terminal,
  ShieldCheck,
  FileText,
  Copy,
  Check,
  Layers,
} from 'lucide-react';

export const IntegrationContractTab: React.FC = () => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const jsonDiagnosis = `{
  "root_cause": "The discount is multiplied by 2 before subtraction.",
  "explanation": "Implementation doubles the deduction, yielding 70.0 instead of 85.0.",
  "affected_files": [
    "backend/demo/calculator.py"
  ],
  "suggested_fix": "Subtract discount once instead of multiplying by 2.",
  "uncertainty": "Diagnosis grounded strictly in supplied failing test trace."
}`;

  const jsonPatch = `{
  "patch": "--- a/backend/demo/calculator.py\\n+++ b/backend/demo/calculator.py\\n@@ -4,3 +4,3 @@\\n-    return price - discount * 2\\n+    return price - discount",
  "affected_files": [
    "backend/demo/calculator.py"
  ],
  "test_recommendation": "pytest tests/test_calculator.py",
  "uncertainty": "No side-effects detected across other module imports."
}`;

  const jsonVerification = `{
  "status": "PASS",
  "passed": 9,
  "failed": 0,
  "exit_code": 0,
  "duration_s": 1.82,
  "container": "patchmind-runner",
  "verified_at": "2026-09-20T08:21:09Z"
}`;

  return (
    <div className="space-y-6">
      {/* Overview & Architecture Rule Banner */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            Integration Contract & Data Boundaries
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Strict separation of concerns between AI generation, API orchestration, and containerized verification.
          </p>
        </div>

        {/* Core Distinction Callout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 font-mono text-xs">
          <div className="bg-amber-950/20 border border-amber-500/40 rounded-xl p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <Cpu className="w-4 h-4" />
              <span>AI Engine → PROPOSES</span>
            </div>
            <p className="text-slate-300 text-[11px] font-sans leading-relaxed">
              Synthesizes root-cause hypotheses and candidate unified diffs. Strictly forbidden from marking payloads as verified or writing to live disk.
            </p>
          </div>

          <div className="bg-emerald-950/20 border border-emerald-500/40 rounded-xl p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-300 font-bold">
              <Terminal className="w-4 h-4" />
              <span>Docker Runner → VERIFIES</span>
            </div>
            <p className="text-slate-300 text-[11px] font-sans leading-relaxed">
              Mounts candidate diffs in fresh, ephemeral, isolated containers. Executes pytest suites and emits authoritative PASS or FAIL decisions.
            </p>
          </div>
        </div>

        {/* Step Flow Diagram */}
        <div className="pt-4 border-t border-slate-800">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono mb-3">
            End-to-End System Integration Sequence
          </h4>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {[
              { name: 'Frontend', owner: 'Web UI' },
              { name: 'FastAPI', owner: 'API Gateway' },
              { name: 'AI Engine', owner: 'Diagnosis & Patch' },
              { name: 'Patch Validation', owner: 'AST Linter' },
              { name: 'Docker Runner', owner: 'Ephemeral Sandbox' },
              { name: 'Verification Result', owner: 'Pytest Suite' },
              { name: 'Report', owner: 'Summary Engine' },
            ].map((step, idx, arr) => (
              <React.Fragment key={step.name}>
                <div className="bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl text-center shadow-sm">
                  <div className="font-bold text-white">{step.name}</div>
                  <div className="text-[10px] text-amber-400 font-sans mt-0.5">{step.owner}</div>
                </div>
                {idx < arr.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-slate-600 shrink-0 hidden sm:block" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* JSON Schema Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* DiagnosisResult */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h4 className="font-bold text-xs text-white font-mono">DiagnosisResult</h4>
              <span className="text-[10px] text-amber-400 font-mono">Produced by AI Engine</span>
            </div>
            <button
              onClick={() => handleCopy(jsonDiagnosis, 'diag')}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              {copiedId === 'diag' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="bg-slate-900 rounded-xl p-3 font-mono text-[11px] border border-slate-800 text-slate-300 overflow-x-auto max-h-72 whitespace-pre leading-relaxed">
            {jsonDiagnosis}
          </div>
        </div>

        {/* PatchResult */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h4 className="font-bold text-xs text-white font-mono">PatchResult</h4>
              <span className="text-[10px] text-amber-400 font-mono">Produced by AI Engine</span>
            </div>
            <button
              onClick={() => handleCopy(jsonPatch, 'patch')}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              {copiedId === 'patch' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="bg-slate-900 rounded-xl p-3 font-mono text-[11px] border border-slate-800 text-slate-300 overflow-x-auto max-h-72 whitespace-pre leading-relaxed">
            {jsonPatch}
          </div>
        </div>

        {/* VerificationResult */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h4 className="font-bold text-xs text-white font-mono">VerificationResult</h4>
              <span className="text-[10px] text-emerald-400 font-mono">Produced by Docker Sandbox</span>
            </div>
            <button
              onClick={() => handleCopy(jsonVerification, 'verif')}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              {copiedId === 'verif' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="bg-slate-900 rounded-xl p-3 font-mono text-[11px] border border-slate-800 text-slate-300 overflow-x-auto max-h-72 whitespace-pre leading-relaxed">
            {jsonVerification}
          </div>
        </div>
      </div>
    </div>
  );
};
