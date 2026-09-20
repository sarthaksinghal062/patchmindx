import React from 'react';
import { Layers, FileCode, Handshake, CheckCircle2, History } from 'lucide-react';

export type ActiveTab = 'demo' | 'files' | 'contract' | 'tests' | 'history';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'demo' as ActiveTab, label: 'Demo Pipeline', icon: Layers },
    { id: 'files' as ActiveTab, label: 'Module Files (7)', icon: FileCode },
    { id: 'contract' as ActiveTab, label: 'Integration Contract', icon: Handshake },
    { id: 'tests' as ActiveTab, label: 'Unit Tests (12/12)', icon: CheckCircle2 },
    { id: 'history' as ActiveTab, label: 'Run History', icon: History },
  ];

  return (
    <nav className="flex items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800 overflow-x-auto max-w-full">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-2 shrink-0 ${
              isActive
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-slate-950 stroke-[2.2]' : 'text-slate-500'}`} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
