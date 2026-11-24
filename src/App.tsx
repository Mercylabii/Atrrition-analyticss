import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Menu, Moon, RefreshCw, Sun } from 'lucide-react';
import type {
  ColumnMapping,
  FilterState,
  ModelId,
  NavSection,
  PredictionInput,
  WorkspacePayload,
} from './shared/types.ts';
import { applyFilters } from './utils/analytics.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { FilterBar } from './components/FilterBar.tsx';
import { OverviewPage } from './components/OverviewPage.tsx';
import { AnalysisPage } from './components/AnalysisPage.tsx';
import { InsightsPage } from './components/InsightsPage.tsx';
import { PredictionPage } from './components/PredictionPage.tsx';
import { ReportsPage } from './components/ReportsPage.tsx';

const SECTION_META: Record<NavSection, { title: string; subtitle: string }> = {
  overview: {
    title: 'Executive Overview',
    subtitle: 'Workforce headcount, turnover KPIs, and organizational attrition pulse',
  },
  analysis: {
    title: 'Attrition Analysis',
    subtitle: 'Multi-dimensional turnover trends, department drivers, compensation, and overtime patterns',
  },
  insights: {
    title: 'Employee Insights & Risk Monitoring',
    subtitle: 'Automated statistical patterns and out-of-fold workforce attrition risk roster',
  },
  prediction: {
    title: 'Attrition Risk Prediction',
    subtitle: 'Evidence-based machine learning risk simulator, model benchmarks, and fairness audit',
  },
  reports: {
    title: 'Reports & Data Management',
    subtitle: 'Dataset quality diagnostics, CSV/summary exports, and replacement dataset retraining',
  },
};

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light'
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('meridian-theme', theme);
    } catch {
      // ignore storage failure
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const [filters, setFilters] = useState<FilterState>({
    department: 'All',
    jobRole: 'All',
    employmentType: 'All',
    gender: 'All',
    manager: 'All',
    hireStartDate: '',
    hireEndDate: '',
  });

  const [predictorSeed, setPredictorSeed] = useState<PredictionInput | null>(null);

  const initFromPayload = useCallback((payload: WorkspacePayload) => {
    setWorkspace(payload);
    setFilters({
      department: 'All',
      jobRole: 'All',
      employmentType: 'All',
      gender: 'All',
      manager: 'All',
      hireStartDate: payload.qualityReport.dateRange.minHireDate,
      hireEndDate: payload.qualityReport.dateRange.maxHireDate,
    });
    const firstDept = payload.options.departments[0] ?? 'General';
    const firstRole = payload.options.rolesByDepartment[firstDept]?.[0] ?? payload.options.jobRoles[0] ?? 'Staff';
    const firstMgr = payload.options.managersByDepartment[firstDept]?.[0] ?? payload.options.managers[0] ?? 'Unassigned';
    const sortedSalaries = payload.employees
      .map((e) => e.Salary_NGN)
      .filter((s) => Number.isFinite(s) && s > 0)
      .sort((a, b) => a - b);
    const medianSalary =
      sortedSalaries.length > 0
        ? sortedSalaries[Math.floor(sortedSalaries.length / 2)]
        : 480000;
    const defaultHireDate =
      payload.qualityReport.dateRange.maxHireDate ||
      payload.qualityReport.dateRange.minHireDate ||
      '2024-01-01';
    setPredictorSeed({
      Age: 32,
      Gender: payload.options.genders[0] ?? 'Female',
      Department: firstDept,
      Job_Role: firstRole,
      Employment_Type: payload.options.employmentTypes[0] ?? 'Full-time',
      Salary_NGN: Math.round(medianSalary),
      Performance_Rating: 3,
      Training_Hours: 24,
      Absence_Days: 8,
      Job_Satisfaction_Score: 2,
      Overtime: 'Yes',
      Manager: firstMgr,
      Hire_Date: defaultHireDate,
    });
  }, []);

  const fetchWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/workspace');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load workforce dataset.');
      initFromPayload(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect to analytics engine.');
    } finally {
      setLoading(false);
    }
  }, [initFromPayload]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const filteredEmployees = useMemo(() => {
    if (!workspace) return [];
    return applyFilters(workspace.employees, filters);
  }, [workspace, filters]);

  const handleResetFilters = useCallback(() => {
    if (!workspace) return;
    setFilters({
      department: 'All',
      jobRole: 'All',
      employmentType: 'All',
      gender: 'All',
      manager: 'All',
      hireStartDate: workspace.qualityReport.dateRange.minHireDate,
      hireEndDate: workspace.qualityReport.dateRange.maxHireDate,
    });
  }, [workspace]);

  const handleSelectModel = async (modelId: ModelId) => {
    const res = await fetch('/api/select-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Model switch failed.');
    setWorkspace(json);
  };

  const handleUploadCsv = async (csvText: string, mapping?: Partial<ColumnMapping>) => {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText, mapping }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'CSV upload failed.');
    initFromPayload(json);
  };

  const handleResetDataset = async () => {
    const res = await fetch('/api/reset-dataset', { method: 'POST' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Dataset reset failed.');
    initFromPayload(json);
  };

  const handleSimulateEmployee = (input: PredictionInput) => {
    setPredictorSeed(input);
    setActiveSection('prediction');
  };

  const handleQuickExportCsv = () => {
    if (!workspace || filteredEmployees.length === 0) return;
    const headers = [
      'Employee_ID',
      'Department',
      'Job_Role',
      'Employment_Type',
      'Hire_Date',
      'Salary_NGN',
      'Performance_Rating',
      'Job_Satisfaction_Score',
      'Overtime',
      'Attrition_Status',
      'Predicted_Attrition_Probability',
      'Risk_Classification',
    ];
    const rows = filteredEmployees.map((e) =>
      [
        e.Employee_ID,
        e.Department,
        e.Job_Role,
        e.Employment_Type,
        e.Hire_Date,
        e.Salary_NGN,
        e.Performance_Rating,
        e.Job_Satisfaction_Score,
        e.Overtime,
        e.Attrition_Status,
        `${(e.attritionProbability * 100).toFixed(1)}%`,
        e.riskClassification,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attrition_filtered_${workspace.qualityReport.snapshotDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading && !workspace) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 max-w-md w-full text-center space-y-3 shadow-sm">
          <div className="h-9 w-9 rounded-lg bg-[#6D132B] mx-auto flex items-center justify-center text-white">
            <RefreshCw className="h-4 w-4 animate-spin" />
          </div>
          <h1 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100">
            Initializing Workforce Analytics &amp; ML Models
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Validating employee records, running stratified cross-validation, and computing risk scores...
          </p>
        </div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <AlertCircle className="h-8 w-8 text-[#6D132B] dark:text-rose-400 mx-auto" />
          <h1 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100">
            Unable to Load Analytics Workspace
          </h1>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{error ?? 'Unexpected error occurred.'}</p>
          <button
            type="button"
            onClick={fetchWorkspace}
            className="px-4 py-2 rounded-lg bg-[#6D132B] text-white text-xs font-semibold hover:bg-[#520B1F]"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const allExited = workspace.employees.filter((e) => e.attritionFlag === 1).length;
  const overallRate =
    workspace.employees.length > 0
      ? (allExited / workspace.employees.length) * 100
      : 0;

  const meta = SECTION_META[activeSection];
  const showFilterBar = activeSection === 'overview' || activeSection === 'analysis';
  const isDark = theme === 'dark';

  return (
    <div className="min-h-screen flex bg-[#F6F6F7] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        totalEmployees={workspace.employees.length}
        attritionRate={overallRate}
        snapshotDate={workspace.qualityReport.snapshotDate}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean Contextual Top Header */}
        <header className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-200/90 dark:border-zinc-800 px-4 sm:px-6 lg:px-8 py-3.5 transition-colors">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden rounded-lg p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h1 className="font-display text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 truncate">
                  {meta.title}
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{meta.subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 transition-colors whitespace-nowrap shrink-0"
              >
                {isDark ? (
                  <>
                    <Sun className="h-3.5 w-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-3.5 w-3.5 text-[#6D132B]" />
                    <span className="hidden sm:inline">Dark</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleQuickExportCsv}
                disabled={filteredEmployees.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5 text-[#6D132B] dark:text-rose-400" />
                Export CSV
              </button>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-[1440px] mx-auto space-y-6">
            {showFilterBar && (
              <FilterBar
                filters={filters}
                options={workspace.options}
                minHireDate={workspace.qualityReport.dateRange.minHireDate}
                maxHireDate={workspace.qualityReport.dateRange.maxHireDate}
                filteredCount={filteredEmployees.length}
                totalCount={workspace.employees.length}
                onChange={setFilters}
                onReset={handleResetFilters}
              />
            )}

            {activeSection === 'overview' && (
              <OverviewPage
                employees={filteredEmployees}
                allEmployees={workspace.employees}
                isDark={isDark}
                onResetFilters={handleResetFilters}
                onNavigate={setActiveSection}
              />
            )}

            {activeSection === 'analysis' && (
              <AnalysisPage
                employees={filteredEmployees}
                isDark={isDark}
                onResetFilters={handleResetFilters}
              />
            )}

            {activeSection === 'insights' && (
              <InsightsPage
                employees={workspace.employees}
                departments={workspace.options.departments}
                onSimulateEmployee={handleSimulateEmployee}
              />
            )}

            {activeSection === 'prediction' && predictorSeed && (
              <PredictionPage
                options={workspace.options}
                trainingSummary={workspace.trainingSummary}
                initialInput={predictorSeed}
                isDark={isDark}
                onSelectModel={handleSelectModel}
              />
            )}

            {activeSection === 'reports' && (
              <ReportsPage
                filteredEmployees={filteredEmployees}
                allEmployees={workspace.employees}
                qualityReport={workspace.qualityReport}
                trainingSummary={workspace.trainingSummary}
                isCustomDataset={workspace.isCustomDataset}
                onUploadCsv={handleUploadCsv}
                onResetDataset={handleResetDataset}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
