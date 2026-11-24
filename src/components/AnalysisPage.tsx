import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Lock, RotateCcw } from 'lucide-react';
import type { ScoredEmployee } from '../shared/types.ts';
import {
  computeAbsenceBrackets,
  computeAttritionTrend,
  computeDemographicBreakdown,
  computeGroupBreakdown,
  computeKpis,
  computeOvertimeSatisfactionHeatmap,
  computeRatingBreakdown,
  computeSalaryBands,
} from '../utils/analytics.ts';

interface AnalysisPageProps {
  employees: ScoredEmployee[];
  isDark?: boolean;
  onResetFilters: () => void;
}

export const AnalysisPage: React.FC<AnalysisPageProps> = ({
  employees,
  isDark = false,
  onResetFilters,
}) => {
  const [trendGranularity, setTrendGranularity] = useState<'quarterly' | 'monthly'>('quarterly');

  const employmentColors = isDark
    ? ['#D94668', '#9E2A47', '#A1A1AA', '#52525B']
    : ['#6D132B', '#9E2A47', '#3F3F46', '#71717A'];
  const chartGrid = isDark ? '#27272A' : '#E4E4E7';
  const chartTick = isDark ? '#A1A1AA' : '#71717A';
  const chartLabelTick = isDark ? '#E4E4E7' : '#27272A';
  const barMuted = isDark ? '#52525B' : '#D4D4D8';
  const barMutedAlt = isDark ? '#52525B' : '#A1A1AA';
  const lineContrast = isDark ? '#F4F4F5' : '#18181B';
  const accentPrimary = isDark ? '#D94668' : '#6D132B';
  const accentSecondary = isDark ? '#FB7185' : '#9E2A47';
  const tooltipStyle = {
    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
    border: isDark ? '1px solid #3F3F46' : '1px solid #E4E4E7',
    color: isDark ? '#F4F4F5' : '#18181B',
    borderRadius: '8px',
    fontSize: '12px',
  };
  const tooltipItemStyle = { color: isDark ? '#F4F4F5' : '#18181B' };
  const tooltipLabelStyle = { color: isDark ? '#A1A1AA' : '#52525B', fontWeight: 600 };

  const kpis = useMemo(() => computeKpis(employees), [employees]);
  const trendData = useMemo(
    () => computeAttritionTrend(employees, trendGranularity),
    [employees, trendGranularity]
  );
  const deptData = useMemo(() => computeGroupBreakdown(employees, 'Department'), [employees]);
  const roleData = useMemo(() => computeGroupBreakdown(employees, 'Job_Role').slice(0, 15), [employees]);
  const empTypeData = useMemo(() => computeGroupBreakdown(employees, 'Employment_Type'), [employees]);
  const demographicData = useMemo(() => computeDemographicBreakdown(employees), [employees]);
  const salaryBands = useMemo(() => computeSalaryBands(employees), [employees]);
  const perfData = useMemo(() => computeRatingBreakdown(employees, 'Performance_Rating'), [employees]);
  const satData = useMemo(() => computeRatingBreakdown(employees, 'Job_Satisfaction_Score'), [employees]);
  const heatmapCells = useMemo(() => computeOvertimeSatisfactionHeatmap(employees), [employees]);
  const absenceBrackets = useMemo(() => computeAbsenceBrackets(employees), [employees]);

  const scatterStayed = useMemo(
    () =>
      employees
        .filter((e) => e.attritionFlag === 0)
        .map((e) => ({
          id: e.Employee_ID,
          absenceDays: e.Absence_Days,
          salaryK: Math.round(e.Salary_NGN / 1000),
          dept: e.Department,
        })),
    [employees]
  );

  const scatterLeft = useMemo(
    () =>
      employees
        .filter((e) => e.attritionFlag === 1)
        .map((e) => ({
          id: e.Employee_ID,
          absenceDays: e.Absence_Days,
          salaryK: Math.round(e.Salary_NGN / 1000),
          dept: e.Department,
        })),
    [employees]
  );

  if (employees.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-10 text-center">
        <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
          No workforce records match the active filters
        </h3>
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#6D132B] text-white text-xs font-semibold hover:bg-[#520B1F]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Filters
        </button>
      </div>
    );
  }

  const suppressedGroupsCount = demographicData.filter(
    (d) => d.femaleSuppressed || d.maleSuppressed
  ).length;

  return (
    <div className="space-y-6">
      {/* A. Attrition Trend */}
      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              A. Attrition &amp; Hiring Trend Over Time
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Tracks employee hires (Hire_Date), exits (Exit_Date), and period attrition rate across time
            </p>
          </div>
          <div className="inline-flex items-center p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setTrendGranularity('quarterly')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                trendGranularity === 'quarterly'
                  ? 'bg-white dark:bg-zinc-900 text-[#6D132B] dark:text-rose-400 shadow-sm font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Quarterly
            </button>
            <button
              type="button"
              onClick={() => setTrendGranularity('monthly')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                trendGranularity === 'monthly'
                  ? 'bg-white dark:bg-zinc-900 text-[#6D132B] dark:text-rose-400 shadow-sm font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11, fill: chartTick }}
                minTickGap={18}
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
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Legend wrapperStyle={{ fontSize: '12px', color: chartTick }} />
              <Bar yAxisId="left" dataKey="hires" name="Hires" fill={barMuted} radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left" dataKey="exits" name="Exits" fill={accentPrimary} radius={[3, 3, 0, 0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="attritionRatePct"
                name="Period Exit Rate (%)"
                stroke={lineContrast}
                strokeWidth={1.75}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* B. Department & C. Job Role */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
          <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            B. Attrition by Department
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 mb-4">
            Departments exceeding the {kpis.attritionRate}% cohort average are highlighted in deep burgundy
          </p>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={deptData}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: chartTick }} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={126}
                  tick={{ fontSize: 11.5, fill: chartLabelTick }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: unknown, _name: unknown, props: { payload?: { exits: number; total: number } }) => [
                    `${value}% (${props.payload?.exits ?? 0} of ${props.payload?.total ?? 0})`,
                    'Attrition Rate',
                  ]}
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Bar dataKey="attritionRate" radius={[0, 4, 4, 0]} barSize={20}>
                  {deptData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={entry.attritionRate > kpis.attritionRate ? accentPrimary : barMutedAlt}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
          <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            C. Attrition by Job Role (Top 15 by Rate)
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 mb-4">
            Job roles ranked by historical exit percentage with sample size context
          </p>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={roleData}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: chartTick }} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={175}
                  tick={{ fontSize: 11, fill: chartLabelTick }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: unknown, _name: unknown, props: { payload?: { exits: number; total: number; department?: string } }) => [
                    `${value}% (${props.payload?.exits ?? 0}/${props.payload?.total ?? 0} · ${props.payload?.department ?? ''})`,
                    'Attrition Rate',
                  ]}
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Bar dataKey="attritionRate" fill={accentPrimary} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* D. Employment Type & E. Gender and Age Group */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <section className="xl:col-span-5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
          <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            D. Attrition by Employment Type
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 mb-3">
            Headcount share and exit rates across Full-time, Part-time, and Contract staff
          </p>

          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={empTypeData}
                  dataKey="exits"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {empTypeData.map((entry, idx) => (
                    <Cell key={entry.name} fill={employmentColors[idx % employmentColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: unknown, _name: unknown, props: { payload?: { name: string; total: number; attritionRate: number } }) => [
                    `${value} exits (${props.payload?.attritionRate ?? 0}% of ${props.payload?.total ?? 0})`,
                    props.payload?.name ?? '',
                  ]}
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 border-t border-zinc-200/80 dark:border-zinc-800 pt-3 space-y-2">
            {empTypeData.map((row, idx) => (
              <div key={row.name} className="flex items-center justify-between text-xs tabular-nums">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: employmentColors[idx % employmentColors.length] }}
                  />
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{row.name}</span>
                </div>
                <div className="text-zinc-600 dark:text-zinc-400">
                  {row.exits}/{row.total} exits ·{' '}
                  <strong className="font-mono text-zinc-900 dark:text-zinc-100">{row.attritionRate}%</strong>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="xl:col-span-7 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                E. Attrition by Gender and Age Group
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Demographic attrition rates with automated privacy suppression for subgroups with fewer than 5 records
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md">
              <Lock className="h-3 w-3 text-[#6D132B] dark:text-rose-400" />
              <span>Privacy threshold: n ≥ 5</span>
            </div>
          </div>

          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={demographicData} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                <XAxis dataKey="ageGroup" tick={{ fontSize: 11, fill: chartTick }} axisLine={false} tickLine={false} />
                <YAxis unit="%" tick={{ fontSize: 11, fill: chartTick }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    value === null ? 'Suppressed (n < 5)' : `${value}%`,
                    String(name),
                  ]}
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="femaleRate" name="Female (%)" fill={accentPrimary} radius={[4, 4, 0, 0]} />
                <Bar dataKey="maleRate" name="Male (%)" fill={barMutedAlt} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {suppressedGroupsCount > 0 && (
            <p className="mt-2 text-[11.5px] text-zinc-500 dark:text-zinc-400">
              Note: {suppressedGroupsCount} age-gender subgroup(s) in the current filter slice contain fewer than 5 employees and are masked to protect individual privacy.
            </p>
          )}
        </section>
      </div>

      {/* F. Salary vs Attrition & G. Performance vs Attrition & H. Job Satisfaction */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
          <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            F. Salary vs Attrition (NGN)
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 mb-3">
            Mean Stayed ₦{kpis.avgSalaryStayed.toLocaleString()} · Left ₦{kpis.avgSalaryLeft.toLocaleString()}
          </p>
          <div className="h-[245px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={salaryBands} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                <XAxis dataKey="band" tick={{ fontSize: 10.5, fill: chartTick }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: chartTick }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 11, fill: chartTick }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar yAxisId="left" dataKey="stayed" name="Stayed" stackId="s" fill={barMuted} />
                <Bar yAxisId="left" dataKey="left" name="Left" stackId="s" fill={accentPrimary} radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="attritionRate"
                  name="Exit Rate (%)"
                  stroke={lineContrast}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
          <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            G. Performance Rating vs Attrition
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 mb-3">
            Headcount and attrition rate across performance tiers (1–5)
          </p>
          <div className="h-[245px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={perfData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                <XAxis dataKey="rating" tick={{ fontSize: 11, fill: chartTick }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: chartTick }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 11, fill: chartTick }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar yAxisId="left" dataKey="stayed" name="Stayed" stackId="p" fill={barMuted} />
                <Bar yAxisId="left" dataKey="exits" name="Left" stackId="p" fill={accentSecondary} radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="attritionRate"
                  name="Exit Rate (%)"
                  stroke={accentPrimary}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
          <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            H. Job Satisfaction vs Attrition
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 mb-3">
            Exit concentration across satisfaction scores (1 = lowest, 5 = highest)
          </p>
          <div className="h-[245px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={satData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                <XAxis dataKey="rating" tick={{ fontSize: 11, fill: chartTick }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: chartTick }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 11, fill: chartTick }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Bar yAxisId="left" dataKey="stayed" name="Stayed" stackId="j" fill={barMuted} />
                <Bar yAxisId="left" dataKey="exits" name="Left" stackId="j" fill={accentPrimary} radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="attritionRate"
                  name="Exit Rate (%)"
                  stroke={lineContrast}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* I. Overtime & Absenteeism (Heatmap + Scatter + Brackets) */}
      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
        <div className="mb-4">
          <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            I. Overtime, Job Satisfaction &amp; Absenteeism Analysis
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Heatmap of attrition rates across Overtime × Satisfaction combinations alongside Absence Days vs. Salary scatter
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Overtime x Satisfaction Heatmap */}
          <div className="xl:col-span-6">
            <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2.5">
              Overtime × Satisfaction Heatmap (Attrition Rate % &amp; Exits/Total)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs tabular-nums">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-2.5 font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                      Overtime
                    </th>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <th
                        key={s}
                        className="text-center py-2 px-2 font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800"
                      >
                        Sat {s}/5
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(['Yes', 'No'] as const).map((ot) => (
                    <tr key={ot}>
                      <td className="py-3 px-2.5 font-semibold text-zinc-800 dark:text-zinc-200 border-b border-zinc-100 dark:border-zinc-800/70">
                        {ot === 'Yes' ? 'Overtime: Yes' : 'Overtime: No'}
                      </td>
                      {[1, 2, 3, 4, 5].map((s) => {
                        const cell = heatmapCells.find(
                          (c) => c.overtime === ot && c.satisfaction === s
                        );
                        const rate = cell?.attritionRate ?? 0;
                        const alpha = Math.min(0.85, Math.max(0.08, rate / 55));
                        const useDarkText = !isDark && alpha < 0.45;
                        const bgRgba = isDark
                          ? `rgba(217, 70, 104, ${alpha.toFixed(2)})`
                          : `rgba(109, 19, 43, ${alpha.toFixed(2)})`;
                        return (
                          <td key={s} className="p-1.5 border-b border-zinc-100 dark:border-zinc-800/70">
                            <div
                              className="rounded-lg py-2.5 px-2 text-center transition-transform"
                              style={{
                                backgroundColor: bgRgba,
                                color: useDarkText ? '#18181B' : '#FFFFFF',
                              }}
                            >
                              <div className="font-mono font-semibold text-[12.5px]">
                                {cell && cell.total > 0 ? `${rate.toFixed(1)}%` : '—'}
                              </div>
                              <div
                                className={`text-[10.5px] mt-0.5 ${
                                  useDarkText ? 'text-zinc-600' : 'text-rose-100'
                                }`}
                              >
                                {cell ? `${cell.exits}/${cell.total}` : '0/0'}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5">
              <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Attrition Rate by Absence Days Bracket
              </h3>
              <div className="grid grid-cols-4 gap-2.5">
                {absenceBrackets.map((b) => (
                  <div
                    key={b.name}
                    className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/50 p-2.5 text-center tabular-nums"
                  >
                    <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{b.name}</div>
                    <div className="mt-1 font-mono text-sm font-bold text-[#6D132B] dark:text-rose-400">
                      {b.attritionRate}%
                    </div>
                    <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                      {b.exits}/{b.total} exits
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Absence Days vs Salary Scatter Plot */}
          <div className="xl:col-span-6">
            <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              Absence Days vs. Monthly Salary (₦ Thousands) by Status
            </h3>
            <div className="h-[290px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 16, left: -8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis
                    type="number"
                    dataKey="absenceDays"
                    name="Absence Days"
                    unit="d"
                    tick={{ fontSize: 11, fill: chartTick }}
                  />
                  <YAxis
                    type="number"
                    dataKey="salaryK"
                    name="Salary"
                    unit="k"
                    tick={{ fontSize: 11, fill: chartTick }}
                  />
                  <ZAxis range={[32, 32]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    formatter={(val: unknown, name: unknown) => [
                      name === 'Salary' ? `₦${val}k` : `${val} days`,
                      String(name),
                    ]}
                    contentStyle={tooltipStyle}
                    itemStyle={tooltipItemStyle}
                    labelStyle={tooltipLabelStyle}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Scatter name="Active (Stayed)" data={scatterStayed} fill={barMutedAlt} fillOpacity={0.65} />
                  <Scatter name="Exited (Left)" data={scatterLeft} fill={accentPrimary} fillOpacity={0.85} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
