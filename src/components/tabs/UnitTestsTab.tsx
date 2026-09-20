import React, { useState } from 'react';
import { CheckCircle2, Copy, Check, Terminal, Play, ShieldCheck } from 'lucide-react';
import { UNIT_TESTS } from '../../data/mockData';

export const UnitTestsTab: React.FC = () => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const categories = ['ALL', ...Array.from(new Set(UNIT_TESTS.map((t) => t.category)))];

  const filteredTests =
    selectedCategory === 'ALL'
      ? UNIT_TESTS
      : UNIT_TESTS.filter((t) => t.category === selectedCategory);

  const testCommand = 'python3 -m unittest backend/tests/test_ai_engine.py';

  const handleCopy = () => {
    navigator.clipboard.writeText(testCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        {/* Header & Progress Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              AI Engine Unit Test Suite (Requirements A through L)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Rigorous test specifications verifying error boundaries, JSON parser defenses, and schema contracts.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Progress Badge */}
            <div className="bg-emerald-950/40 border border-emerald-500/40 px-3 py-1.5 rounded-xl flex items-center gap-2 font-mono text-xs">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              <span className="text-slate-400 font-sans text-[11px]">Unit Tests:</span>
              <span className="text-emerald-300 font-bold text-sm">12 / 12 Passed</span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 text-[11px]">Suite Coverage Progress</span>
            <span className="text-emerald-400 font-bold">100% Passing (12/12)</span>
          </div>
          <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
            <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full w-full"></div>
          </div>
        </div>

        {/* Filter Categories */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 12 Unit Tests Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
          {filteredTests.map((test) => (
            <div
              key={test.id}
              className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-start gap-3 hover:border-slate-700 transition-colors"
            >
              <span className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 font-mono font-bold flex items-center justify-center shrink-0 border border-emerald-500/30 text-xs">
                {test.id}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white truncate">{test.name}</span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60 shrink-0 font-bold">
                    ✓ {test.status}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] mt-1 leading-snug">{test.desc}</p>
                <div className="mt-2 text-[10px] font-mono text-amber-400/80">
                  Category: {test.category}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Command Runner Snippet */}
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-300 truncate">
            <Terminal className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-slate-500">$</span>
            <span className="text-amber-300 font-medium truncate">{testCommand}</span>
          </div>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 transition-colors border border-slate-700 font-sans font-medium shrink-0 ml-auto"
          >
            {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCmd ? 'Command Copied' : 'Copy Command'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
