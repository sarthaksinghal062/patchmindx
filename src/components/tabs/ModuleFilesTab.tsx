import React, { useState } from 'react';
import {
  FileCode,
  Folder,
  ChevronRight,
  Copy,
  Check,
  Cpu,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { MODULE_FILES } from '../../data/mockData';
import { ModuleFileSpec } from '../../types';

export const ModuleFilesTab: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<ModuleFileSpec>(MODULE_FILES[2]); // bug_analyzer.py
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyPath = () => {
    navigator.clipboard.writeText(selectedFile.path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: File Tree */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <Folder className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                backend/app/ai/ (7 Files)
              </h3>
            </div>

            {/* Tree Structure */}
            <div className="space-y-1">
              {MODULE_FILES.map((file, idx) => {
                const isSelected = selectedFile.path === file.path;
                const isLast = idx === MODULE_FILES.length - 1;
                const branchPrefix = isLast ? '└── ' : '├── ';

                return (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center justify-between border font-mono ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500/60 text-white font-semibold shadow-md'
                        : 'bg-slate-900/50 border-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-900 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-slate-600 select-none text-[11px]">{branchPrefix}</span>
                      <FileCode className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-slate-500'}`} />
                      <span className="truncate">{file.name}</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-50 shrink-0" />
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between font-mono">
              <span>Subsystem: AI Engine</span>
              <span className="text-emerald-400">100% Production Ready</span>
            </div>
          </div>
        </div>

        {/* Right Column: File Details & Code Preview */}
        <div className="lg:col-span-8 bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white font-mono">{selectedFile.path}</h3>
                <button
                  onClick={handleCopyPath}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                  title="Copy Path"
                >
                  {copiedPath ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <p className="text-xs text-amber-400 font-medium mt-0.5">{selectedFile.role}</p>
            </div>

            <button
              onClick={handleCopyCode}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs flex items-center gap-1.5 font-mono transition-colors border border-slate-700 font-medium"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Code Copied' : 'Copy Code'}</span>
            </button>
          </div>

          {/* Role & Summary */}
          <div className="space-y-3 text-xs leading-relaxed">
            <div>
              <h4 className="font-semibold text-slate-300 mb-1">Architectural Role & Purpose:</h4>
              <p className="text-slate-300 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                {selectedFile.summary}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-slate-300 mb-1">Integration Touchpoint:</h4>
              <p className="text-slate-400 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 font-mono text-[11px]">
                {selectedFile.connectsTo}
              </p>
            </div>
          </div>

          {/* Read-only Code Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span className="font-mono text-[11px] font-semibold text-slate-300">
                Read-Only Code Preview ({selectedFile.name})
              </span>
              <span className="text-[10px] font-mono text-slate-500">Python 3.11+</span>
            </div>

            <div className="bg-slate-900/90 rounded-xl p-4 font-mono text-xs border border-slate-800 max-h-96 overflow-y-auto leading-relaxed text-slate-200 whitespace-pre">
              {selectedFile.code}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
