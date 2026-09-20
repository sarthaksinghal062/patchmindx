import React, { useState } from 'react';
import { X, Copy, Check, FileCode, CheckCircle2 } from 'lucide-react';

interface DiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  diff: string;
  filePath?: string;
}

export const DiffModal: React.FC<DiffModalProps> = ({
  isOpen,
  onClose,
  diff,
  filePath = 'backend/demo/calculator.py',
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(diff);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm text-white font-mono">{filePath}</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
              UNIFIED DIFF
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 font-mono transition-colors border border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Diff content */}
        <div className="p-5 font-mono text-xs overflow-y-auto space-y-1 bg-slate-950/50 leading-relaxed">
          <div className="text-slate-500">--- a/{filePath}</div>
          <div className="text-slate-500">+++ b/{filePath}</div>
          <div className="text-cyan-400 font-semibold my-2">@@ -4,3 +4,3 @@</div>
          <div className="text-slate-400">&nbsp;&nbsp;&nbsp;&nbsp;if price &lt; 0 or discount &lt; 0:</div>
          <div className="text-slate-400">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;raise ValueError(&quot;Price and discount must be non-negative&quot;)</div>
          <div className="bg-rose-950/70 border-l-2 border-rose-500 text-rose-300 px-3 py-1 rounded font-mono">
            -&nbsp;&nbsp;&nbsp;&nbsp;return price - discount * 2
          </div>
          <div className="bg-emerald-950/70 border-l-2 border-emerald-500 text-emerald-300 px-3 py-1 rounded font-mono">
            +&nbsp;&nbsp;&nbsp;&nbsp;return price - discount
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 text-xs text-slate-400 flex items-center justify-between">
          <span>Synthesized by PatchMind AI Engine (Surgical single-line fix)</span>
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
