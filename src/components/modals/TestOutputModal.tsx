import React, { useState } from 'react';
import { X, Copy, Check, Terminal } from 'lucide-react';

interface TestOutputModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPassing?: boolean;
}

export const TestOutputModal: React.FC<TestOutputModalProps> = ({
  isOpen,
  onClose,
  isPassing = true,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const rawPassingOutput = `============================= test session starts ==============================
platform linux -- Python 3.11.8, pytest-8.1.1, pluggy-1.4.0
rootdir: /workspace/patchmind-runner
collected 9 items

tests/test_calculator.py::test_calculate_discounted_price_standard PASSED  [ 11%]
tests/test_calculator.py::test_calculate_discounted_price_zero_discount PASSED [ 22%]
tests/test_calculator.py::test_calculate_discounted_price_full_discount PASSED [ 33%]
tests/test_calculator.py::test_negative_price_raises_error PASSED          [ 44%]
tests/test_calculator.py::test_negative_discount_raises_error PASSED       [ 55%]
tests/test_calculator.py::test_float_precision_cents PASSED                 [ 66%]
tests/test_calculator.py::test_large_amounts PASSED                        [ 77%]
tests/test_calculator.py::test_discount_boundary_check PASSED              [ 88%]
tests/test_calculator.py::test_idempotent_calculation PASSED               [100%]

============================== 9 passed in 1.82s ===============================
Docker Container Exit Code: 0 (SUCCESS)`;

  const rawFailingOutput = `============================= test session starts ==============================
platform linux -- Python 3.11.8, pytest-8.1.1, pluggy-1.4.0
rootdir: /workspace/patchmind-runner
collected 9 items

tests/test_calculator.py::test_calculate_discounted_price_standard FAILED  [ 11%]
tests/test_calculator.py::test_calculate_discounted_price_zero_discount PASSED [ 22%]
tests/test_calculator.py::test_calculate_discounted_price_full_discount PASSED [ 33%]
tests/test_calculator.py::test_negative_price_raises_error PASSED          [ 44%]
tests/test_calculator.py::test_negative_discount_raises_error PASSED       [ 55%]
tests/test_calculator.py::test_float_precision_cents PASSED                 [ 66%]
tests/test_calculator.py::test_large_amounts PASSED                        [ 77%]
tests/test_calculator.py::test_discount_boundary_check PASSED              [ 88%]
tests/test_calculator.py::test_idempotent_calculation PASSED               [100%]

=================================== FAILURES ===================================
__________________ test_calculate_discounted_price_standard ____________________
    def test_calculate_discounted_price_standard() -> None:
>       assert calculate_discounted_price(100.0, 15.0) == 85.0
E       AssertionError: assert 92.5 == 85.0

========================= 1 failed, 8 passed in 1.95s ==========================
Docker Container Exit Code: 1 (VERIFICATION FAILED)`;

  const output = isPassing ? rawPassingOutput : rawFailingOutput;

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-white font-mono">Docker Sandbox Pytest Terminal Output</h3>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                isPassing
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}
            >
              EXIT {isPassing ? '0' : '1'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 font-mono transition-colors border border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Output'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Console content */}
        <div className="p-5 font-mono text-xs overflow-y-auto bg-slate-950/90 text-slate-200 leading-relaxed whitespace-pre font-mono">
          {output}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 text-xs text-slate-400 flex items-center justify-between">
          <span>Executed in container: patchmind-runner (restricted offline network)</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
