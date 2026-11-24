import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Search,
  Shield,
  Sliders,
  X,
} from 'lucide-react';
import type {
  PredictionInput,
  RiskLevel,
  ScoredEmployee,
} from '../shared/types.ts';
import { generateAutomatedInsights } from '../utils/analytics.ts';

interface InsightsPageProps {
  employees: ScoredEmployee[];
  departments: string[];
  onSimulateEmployee: (input: PredictionInput) => void;
}

type SortKey =
  | 'Employee_ID'
  | 'Department'
  | 'Job_Role'
  | 'Employment_Type'
  | 'Job_Satisfaction_Score'
  | 'Performance_Rating'
  | 'attritionProbability';

const PAGE_SIZE = 15;

export const InsightsPage: React.FC<InsightsPageProps> = ({
  employees,
  departments,
  onSimulateEmployee,
}) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState<'All' | RiskLevel>('All');
  const [statusFilter, setStatusFilter] = useState<'Active' | 'All' | 'Exited'>('Active');
  const [sortKey, setSortKey] = useState<SortKey>('attritionProbability');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selectedEmployee, setSelectedEmployee] = useState<ScoredEmployee | null>(null);

  const insights = useMemo(() => generateAutomatedInsights(employees), [employees]);

  const monitoredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = employees.filter((e) => {
      if (statusFilter === 'Active' && e.Employment_Status !== 'Active') return false;
      if (statusFilter === 'Exited' && e.Employment_Status !== 'Exited') return false;
      if (deptFilter !== 'All' && e.Department !== deptFilter) return false;
      if (riskFilter !== 'All' && e.riskClassification !== riskFilter) return false;
      if (
        q &&
        !e.Employee_ID.toLowerCase().includes(q) &&
        !e.Job_Role.toLowerCase().includes(q) &&
        !e.Department.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

    return sorted;
  }, [employees, search, deptFilter, riskFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(monitoredList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = monitoredList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'attritionProbability' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const renderRiskIndicator = (risk: RiskLevel) => {
    if (risk === 'High Risk') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6D132B] dark:text-rose-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          High Risk
        </span>
      );
    }
    if (risk === 'Medium Risk') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Medium Risk
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Low Risk
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Automated Statistical Insights */}
      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Automated Workforce Insights
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Key statistical patterns derived from the active dataset. Observed associations highlight areas for HR review and do not establish causal proof.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {insights.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-800/40 p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  <span>{item.category}</span>
                  <span className="font-mono font-semibold text-[#6D132B] dark:text-rose-400 tabular-nums">
                    {item.metricValue}
                  </span>
                </div>
                <h3 className="mt-1.5 font-display text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                  {item.headline}
                </h3>
                <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {item.explanation}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Employee Risk Monitoring Roster */}
      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Employee Risk Monitoring Roster
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Out-of-fold predicted attrition risk across employees. Click any row to inspect work-factor drivers.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 px-2.5 py-1 rounded-md">
            <Shield className="h-3.5 w-3.5 text-[#6D132B] dark:text-rose-400" />
            <span>Role-scoped view · PII &amp; demographic fields omitted from risk scoring</span>
          </div>
        </div>

        {/* Table Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search ID, role, or department..."
              aria-label="Search employees"
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/80 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-[#6D132B] dark:focus:border-rose-400 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter by department"
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/80 px-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#6D132B] dark:focus:border-rose-400 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none"
          >
            <option value="All">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by risk level"
            value={riskFilter}
            onChange={(e) => {
              setRiskFilter(e.target.value as 'All' | RiskLevel);
              setPage(1);
            }}
            className="h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/80 px-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#6D132B] dark:focus:border-rose-400 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none"
          >
            <option value="All">All Risk Levels</option>
            <option value="High Risk">High Risk (≥ 65%)</option>
            <option value="Medium Risk">Medium Risk (35%–64%)</option>
            <option value="Low Risk">Low Risk (&lt; 35%)</option>
          </select>

          <div className="inline-flex items-center p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-700">
            {(['Active', 'All', 'Exited'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`flex-1 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white dark:bg-zinc-900 text-[#6D132B] dark:text-rose-400 shadow-sm font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* High-Density Data Grid */}
        <div className="overflow-x-auto border border-zinc-200/80 dark:border-zinc-800 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-50/90 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300">
                {(
                  [
                    ['Employee_ID', 'Employee ID', 'left'],
                    ['Department', 'Department', 'left'],
                    ['Job_Role', 'Job Role', 'left'],
                    ['Employment_Type', 'Type', 'left'],
                    ['Job_Satisfaction_Score', 'Satisfaction', 'right'],
                    ['Performance_Rating', 'Performance', 'right'],
                    ['attritionProbability', 'Probability', 'right'],
                  ] as Array<[SortKey, string, 'left' | 'right']>
                ).map(([key, label, align]) => (
                  <th
                    key={key}
                    className={`py-2.5 px-3 font-semibold whitespace-nowrap ${
                      align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className="inline-flex items-center gap-1 hover:text-[#6D132B] dark:hover:text-rose-400 transition-colors"
                    >
                      <span>{label}</span>
                      <ArrowDownUp className="h-3 w-3 opacity-50" />
                    </button>
                  </th>
                ))}
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap text-left">
                  Risk Classification
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80 tabular-nums">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-zinc-500 dark:text-zinc-400">
                    No employees match the current search and risk filter criteria.
                  </td>
                </tr>
              ) : (
                pageRows.map((emp) => {
                  const pct = Math.round(emp.attritionProbability * 100);
                  return (
                    <tr
                      key={emp.Employee_ID}
                      onClick={() => setSelectedEmployee(emp)}
                      className="hover:bg-rose-50/40 dark:hover:bg-rose-950/25 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                        {emp.Employee_ID}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                        {emp.Department}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-800 dark:text-zinc-200 max-w-[200px] truncate">
                        {emp.Job_Role}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {emp.Employment_Type}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-zinc-800 dark:text-zinc-200">
                        {emp.Job_Satisfaction_Score} / 5
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-zinc-800 dark:text-zinc-200">
                        {emp.Performance_Rating} / 5
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {pct}%
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {renderRiskIndicator(emp.riskClassification)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
          <div>
            Showing{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">
              {monitoredList.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}
            </strong>
            –
            <strong className="text-zinc-800 dark:text-zinc-200">
              {Math.min(safePage * PAGE_SIZE, monitoredList.length)}
            </strong>{' '}
            of <strong className="text-zinc-800 dark:text-zinc-200">{monitoredList.length}</strong> employees
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <span className="px-2 font-mono text-zinc-700 dark:text-zinc-300">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Slide-Over Employee Profile Drawer */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-zinc-950/50 backdrop-blur-[1px]"
            onClick={() => setSelectedEmployee(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-zinc-900 h-full shadow-2xl border-l border-zinc-200 dark:border-zinc-800 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <div className="font-mono text-xs font-semibold text-[#6D132B] dark:text-rose-400">
                  {selectedEmployee.Employee_ID} · {selectedEmployee.Employment_Status}
                </div>
                <h3 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {selectedEmployee.Job_Role}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="rounded-lg p-1.5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
                aria-label="Close employee details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 flex-1">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/50 p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Out-of-Fold Attrition Estimate</div>
                  <div className="mt-1 font-display text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {Math.round(selectedEmployee.attritionProbability * 100)}%
                  </div>
                </div>
                <div>{renderRiskIndicator(selectedEmployee.riskClassification)}</div>
              </div>

              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs border-b border-zinc-200 dark:border-zinc-800 pb-4 tabular-nums">
                <div>
                  <div className="text-zinc-500 dark:text-zinc-400">Department</div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">{selectedEmployee.Department}</div>
                </div>
                <div>
                  <div className="text-zinc-500 dark:text-zinc-400">Employment Type</div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">{selectedEmployee.Employment_Type}</div>
                </div>
                <div>
                  <div className="text-zinc-500 dark:text-zinc-400">Manager</div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">{selectedEmployee.Manager}</div>
                </div>
                <div>
                  <div className="text-zinc-500 dark:text-zinc-400">Tenure</div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {selectedEmployee.actualTenureMonths} months
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 dark:text-zinc-400">Monthly Salary</div>
                  <div className="font-mono font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">
                    ₦{selectedEmployee.Salary_NGN.toLocaleString('en-US')}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 dark:text-zinc-400">Overtime</div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">{selectedEmployee.Overtime}</div>
                </div>
                <div>
                  <div className="text-zinc-500 dark:text-zinc-400">Satisfaction / Perf</div>
                  <div className="font-mono font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {selectedEmployee.Job_Satisfaction_Score}/5 · {selectedEmployee.Performance_Rating}/5
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 dark:text-zinc-400">Training / Absence</div>
                  <div className="font-mono font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {selectedEmployee.Training_Hours}h · {selectedEmployee.Absence_Days}d
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2.5">
                  Primary Model Drivers (Work Factors Only)
                </h4>
                <div className="space-y-2">
                  {selectedEmployee.topDrivers.map((d) => (
                    <div
                      key={d.factor}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                    >
                      <div>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{d.factor}</span>
                        <span className="text-zinc-500 dark:text-zinc-400 ml-1.5">· {d.detail}</span>
                      </div>
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          d.impact >= 0
                            ? 'text-[#6D132B] dark:text-rose-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {d.impact >= 0 ? '+' : ''}
                        {d.impact} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                This profile estimate excludes Age and Gender and serves strictly as decision support for proactive retention conversations.
              </p>
            </div>

            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const emp = selectedEmployee;
                  setSelectedEmployee(null);
                  onSimulateEmployee({
                    Age: emp.Age,
                    Gender: emp.Gender,
                    Department: emp.Department,
                    Job_Role: emp.Job_Role,
                    Employment_Type: emp.Employment_Type,
                    Salary_NGN: emp.Salary_NGN,
                    Performance_Rating: emp.Performance_Rating,
                    Training_Hours: emp.Training_Hours,
                    Absence_Days: emp.Absence_Days,
                    Job_Satisfaction_Score: emp.Job_Satisfaction_Score,
                    Overtime: emp.Overtime,
                    Manager: emp.Manager,
                    Hire_Date: emp.Hire_Date,
                  });
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#6D132B] text-white text-xs font-semibold hover:bg-[#520B1F] transition-colors"
              >
                <Sliders className="h-3.5 w-3.5" />
                Open in Attrition Predictor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
