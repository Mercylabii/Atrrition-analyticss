import React from 'react';
import {
  Activity,
  BarChart3,
  FileSpreadsheet,
  LayoutDashboard,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { NavSection } from '../shared/types.ts';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  totalEmployees: number;
  attritionRate: number;
  snapshotDate: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'overview',
    label: 'Overview',
    subtitle: 'Executive KPIs & pulse',
    icon: LayoutDashboard,
  },
  {
    id: 'analysis',
    label: 'Attrition Analysis',
    subtitle: 'Drivers & trends',
    icon: BarChart3,
  },
  {
    id: 'insights',
    label: 'Employee Insights',
    subtitle: 'Patterns & risk roster',
    icon: ShieldAlert,
  },
  {
    id: 'prediction',
    label: 'Attrition Prediction',
    subtitle: 'ML risk simulator',
    icon: Activity,
  },
  {
    id: 'reports',
    label: 'Reports & Data',
    subtitle: 'Quality, exports & CSV',
    icon: FileSpreadsheet,
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  totalEmployees,
  attritionRate,
  snapshotDate,
  mobileOpen,
  onCloseMobile,
}) => {
  const content = (
    <div className="flex h-full w-[252px] flex-col bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 select-none transition-colors">
      {/* Brand Lockup */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#6D132B] text-white shadow-sm">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path d="M4 18V9l5 4 5-7 6 5v7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 18h16" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="font-display text-[15px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100 truncate">
              Meridian HR
            </div>
            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate">
              Attrition Intelligence
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden rounded-md p-1.5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D132B] dark:focus-visible:ring-rose-400 ${
                isActive
                  ? 'bg-[#6D132B] text-white shadow-sm'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive ? 'text-rose-100' : 'text-zinc-400 dark:text-zinc-500'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[13.5px] font-semibold leading-tight truncate ${
                    isActive ? 'text-white' : 'text-zinc-900 dark:text-zinc-100'
                  }`}
                >
                  {item.label}
                </div>
                <div
                  className={`text-[11px] leading-tight mt-0.5 truncate ${
                    isActive ? 'text-rose-100/80' : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {item.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Quiet Dataset Summary Footer */}
      <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/80">
        <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Active Workforce Dataset</div>
        <div className="mt-1.5 flex items-baseline justify-between text-xs text-zinc-800 dark:text-zinc-200 tabular-nums">
          <span className="font-semibold">{totalEmployees.toLocaleString()} records</span>
          <span className="font-mono text-[11px] text-[#6D132B] dark:text-rose-400 font-semibold">
            {attritionRate.toFixed(1)}% exit
          </span>
        </div>
        <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
          Snapshot · {snapshotDate}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0 z-20">
        {content}
      </aside>

      {/* Mobile/Tablet overlay drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-zinc-950/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
};
