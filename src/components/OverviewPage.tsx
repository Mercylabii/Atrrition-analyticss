import React, { useMemo } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, RotateCcw } from 'lucide-react';
import type { NavSection, ScoredEmployee } from '../shared/types.ts';
import {
  computeAttritionTrend,
  computeGroupBreakdown,
  computeKpis,
  generateAutomatedInsights,
} from '../utils/analytics.ts';

interface OverviewPageProps {
  employees: ScoredEmployee[];
  allEmployees: ScoredEmployee[];
  isDark?: boolean;
  onResetFilters: () => void;
  onNavigate: (section: NavSection) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  employees,
  allEmployees,
  isDark = false,
  onResetFilters,
  onNavigate,
}) => {
  const kpis = useMemo(() => computeKpis(employees), [employees]);
  const benchmarkKpis = useMemo(() => computeKpis(allEmployees), [allEmployees]);
  const quarterlyTrend = useMemo(
    () => computeAttritionTrend(employees, 'quarterly').slice(-16),
    [employees]
  );
  const deptBreakdown = useMemo(
    () => computeGroupBreakdown(employees, 'Department'),
    [employees]
  );
  const topInsights = useMemo(
    () => generateAutomatedInsights(employees).slice(0, 3),
    [employees]
  );

  const chartGrid = isDark ? '#27272A' : '#E4E4E7';
  const chartTick = isDark ? '#A1A1AA' : '#71717A';
  const chartLabelTick = isDark ? '#E4E4E7' : '#27272A';
  const lineNeutral = isDark ? '#E4E4E7' : '#3F3F46';
  const accentPrimary = isDark ? '#D94668' : '#6D132B';
  const tooltipStyle = {
    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
    border: isDark ? '1px solid #3F3F46' : '1px solid #E4E4E7',
    color: isDark ? '#F4F4F5' : '#18181B',
    borderRadius: '8px',
    fontSize: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  };
  const tooltipItemStyle = { color: isDark ? '#F4F4F5' : '#18181B' };
  const tooltipLabelStyle = { color: isDark ? '#A1A1AA' : '#52525B', fontWeight: 600 };

  if (employees.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-10 text-center">
        <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
          No employees match the active filter combination
        </h3>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
          Adjust or clear the current department, role, manager, or hire date filters to view workforce KPIs and visualizations.
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#6D132B] text-white text-xs font-semibold hover:bg-[#520B1F] transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset All Filters
        </button>
      </div>
    );
  }

  const highRiskActive = employees.filter(
    (e) => e.Employment_Status === 'Active' && e.riskClassification === 'High Risk'
  ).length;

  const rateDiff = Number((kpis.attritionRate - benchmarkKpis.attritionRate).toFixed(1));

  return (
    <div className="space-y-6">
      {/* 6 Executive KPI Cards */}
      <section aria-label="Key Performance Indicators" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between transition-colors">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Employees</div>
          <div className="mt-2 font-display text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {kpis.totalEmployees.toLocaleString()}
          </div>
          <div className="mt-2 text-[11.5px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            {kpis.activeEmployees} active · {kpis.exitedEmployees} exited
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between transition-colors">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Employees Who Left</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#6D132B] dark:text-rose-400 tabular-nums">
            {kpis.exitedEmployees.toLocaleString()}
          </div>
          <div className="mt-2 text-[11.5px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            Avg tenure {kpis.avgActualTenureLeftMonths} mo at exit
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between transition-colors">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Overall Attrition Rate</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#6D132B] dark:text-rose-400 tabular-nums">
            {kpis.attritionRate.toFixed(1)}%
          </div>
          <div className="mt-2 text-[11.5px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            {rateDiff === 0
              ? `Matches org baseline (${benchmarkKpis.attritionRate}%)`
              : `${rateDiff > 0 ? '+' : ''}${rateDiff} pts vs org (${benchmarkKpis.attritionRate}%)`}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between transition-colors">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Employee Retention Rate</div>
          <div className="mt-2 font-display text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {kpis.retentionRate.toFixed(1)}%
          </div>
          <div className="mt-2 text-[11.5px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            {highRiskActive} active flagged High Risk
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between transition-colors">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Avg Job Satisfaction</div>
          <div className="mt-2 font-display text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {kpis.avgSatisfaction.toFixed(2)}
            <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500"> / 5.0</span>
          </div>
          <div className="mt-2 text-[11.5px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            Stayed {kpis.avgSatisfactionStayed} · Left {kpis.avgSatisfactionLeft}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between transition-colors">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Avg Performance Rating</div>
          <div className="mt-2 font-display text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {kpis.avgPerformance.toFixed(2)}
            <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500"> / 5.0</span>
          </div>
          <div className="mt-2 text-[11.5px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            Stayed {kpis.avgPerformanceStayed} · Left {kpis.avgPerformanceLeft}
          </div>
        </div>
      </section>

      {/* Primary Executive Visualizations */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Quarterly Exits & Attrition Rate */}
        <div className="xl:col-span-7 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Quarterly Attrition Trajectory
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Employee exits and quarterly attrition rate across the most recent 16 quarters
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analysis')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#6D132B] dark:text-rose-400 hover:text-[#520B1F] dark:hover:text-rose-300 whitespace-nowrap"
            >
              Full Trend Analysis
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="h-[290px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={quarterlyTrend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="wineFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={accentPrimary} stopOpacity={isDark ? 0.34 : 0.22} />
                    <stop offset="95%" stopColor={accentPrimary} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 11, fill: chartTick }}
                  axisLine={{ stroke: chartGrid }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: chartTick }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  unit="%"
                  tick={{ fontSize: 11, fill: chartTick }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="exits"
                  name="Exits"
                  fill="url(#wineFill)"
                  stroke={accentPrimary}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="attritionRatePct"
                  name="Quarterly Exit Rate (%)"
                  stroke={lineNeutral}
                  strokeWidth={1.75}
                  dot={{ r: 2.5, fill: lineNeutral }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Department Attrition Comparison */}
        <div className="xl:col-span-5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Attrition Rate by Department
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Ranked percentage of employees who exited per business unit
              </p>
            </div>
          </div>

          <div className="h-[290px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={deptBreakdown}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                <XAxis
                  type="number"
                  unit="%"
                  tick={{ fontSize: 11, fill: chartTick }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={122}
                  tick={{ fontSize: 11.5, fill: chartLabelTick }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: unknown, _name: unknown, props: { payload?: { exits: number; total: number } }) => [
                    `${value}% (${props.payload?.exits ?? 0}/${props.payload?.total ?? 0} exits)`,
                    'Attrition Rate',
                  ]}
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Bar dataKey="attritionRate" radius={[0, 4, 4, 0]} barSize={18}>
                  {deptBreakdown.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={
                        entry.attritionRate > kpis.attritionRate
                          ? accentPrimary
                          : isDark
                          ? '#9E2A47'
                          : '#9E2A47'
                      }
                      fillOpacity={entry.attritionRate > kpis.attritionRate ? 1 : 0.45}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Automated Executive Takeaways + Quick Action Band */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Automated Workforce Findings
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Statistical associations computed directly from the filtered dataset (correlation does not imply causation)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('insights')}
              className="text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-[#6D132B] dark:hover:text-rose-400 transition-colors whitespace-nowrap"
            >
              View All Insights &amp; Risk Table
            </button>
            <button
              type="button"
              onClick={() => onNavigate('prediction')}
              className="px-3.5 py-2 rounded-lg bg-[#6D132B] text-white text-xs font-semibold hover:bg-[#520B1F] transition-colors whitespace-nowrap"
            >
              Open Risk Predictor
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 divide-y md:divide-y-0 md:divide-x divide-zinc-200/80 dark:divide-zinc-800">
          {topInsights.map((insight, idx) => (
            <div key={insight.id} className={idx > 0 ? 'pt-4 md:pt-0 md:pl-5' : ''}>
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                <span>{insight.category}</span>
                <span className="font-mono font-semibold text-[#6D132B] dark:text-rose-400 tabular-nums">
                  {insight.metricValue}
                </span>
              </div>
              <h3 className="mt-1.5 font-display text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                {insight.headline}
              </h3>
              <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {insight.explanation}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
