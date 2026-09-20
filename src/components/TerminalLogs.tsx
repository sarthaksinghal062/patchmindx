import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Copy, Check, Trash2, ArrowDown } from 'lucide-react';
import { LogEntry } from '../types';

interface TerminalLogsProps {
  logs: LogEntry[];
  onClear?: () => void;
}

export const TerminalLogs: React.FC<TerminalLogsProps> = ({ logs, onClear }) => {
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.prefix}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getPrefixStyle = (prefix: LogEntry['prefix']) => {
    switch (prefix) {
      case 'ERROR':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'AI':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'VALIDATE':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'DOCKER':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'TEST':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
      case 'VERIFY':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'REPORT':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'INFO':
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div id="terminal-logs-panel" className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white tracking-tight">Live Pipeline Event Stream</h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
            {logs.length} events
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onClear && (
            <button
              onClick={onClear}
              title="Clear logs"
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleCopyLogs}
            className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs flex items-center gap-1 font-mono transition-colors border border-slate-800"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Terminal log window */}
      <div
        ref={scrollRef}
        className="bg-slate-900/90 rounded-xl p-3.5 font-mono text-xs border border-slate-800 h-52 overflow-y-auto space-y-1.5 scroll-smooth"
      >
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-2.5 text-[11px] leading-relaxed">
            <span className="text-slate-500 font-mono text-[10px] shrink-0 select-none mt-0.5">
              [{log.timestamp}]
            </span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 border ${getPrefixStyle(
                log.prefix
              )}`}
            >
              {log.prefix}
            </span>
            <span
              className={`break-all ${
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
  );
};
