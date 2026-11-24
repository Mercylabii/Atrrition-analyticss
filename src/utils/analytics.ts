import type { CleanEmployee, FilterState, ScoredEmployee } from '../shared/types.ts';

export interface KpiMetrics {
  totalEmployees: number;
  activeEmployees: number;
  exitedEmployees: number;
  attritionRate: number;
  retentionRate: number;
  avgSatisfaction: number;
  avgSatisfactionStayed: number;
  avgSatisfactionLeft: number;
  avgPerformance: number;
  avgPerformanceStayed: number;
  avgPerformanceLeft: number;
  avgSalary: number;
  avgSalaryStayed: number;
  avgSalaryLeft: number;
  avgActualTenureLeftMonths: number;
}

export interface TrendPoint {
  period: string;
  exits: number;
  hires: number;
  activeHeadcount: number;
  attritionRatePct: number;
}

export interface GroupAttritionPoint {
  name: string;
  department?: string;
  total: number;
  active: number;
  exits: number;
  attritionRate: number;
  avgSalary: number;
  avgSatisfaction: number;
}

export interface DemographicPoint {
  ageGroup: string;
  femaleTotal: number;
  femaleExits: number;
  femaleRate: number | null;
  femaleSuppressed: boolean;
  maleTotal: number;
  maleExits: number;
  maleRate: number | null;
  maleSuppressed: boolean;
}

export interface SalaryBandPoint {
  band: string;
  stayed: number;
  left: number;
  total: number;
  attritionRate: number;
}

export interface RatingAttritionPoint {
  rating: string;
  numericRating: number;
  total: number;
  exits: number;
  stayed: number;
  attritionRate: number;
}

export interface HeatmapCell {
  overtime: 'Yes' | 'No';
  satisfaction: number;
  total: number;
  exits: number;
  attritionRate: number;
}

export interface AutomatedInsight {
  id: string;
  category: string;
  headline: string;
  explanation: string;
  metricValue: string;
  severity: 'elevated' | 'notable' | 'protective';
}

export function applyFilters(
  employees: ScoredEmployee[],
  filters: FilterState
): ScoredEmployee[] {
  return employees.filter((e) => {
    if (filters.department !== 'All' && e.Department !== filters.department) return false;
    if (filters.jobRole !== 'All' && e.Job_Role !== filters.jobRole) return false;
    if (filters.employmentType !== 'All' && e.Employment_Type !== filters.employmentType) return false;
    if (filters.gender !== 'All' && e.Gender !== filters.gender) return false;
    if (filters.manager !== 'All' && e.Manager !== filters.manager) return false;
    if (filters.hireStartDate && e.Hire_Date < filters.hireStartDate) return false;
    if (filters.hireEndDate && e.Hire_Date > filters.hireEndDate) return false;
    return true;
  });
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeKpis(employees: CleanEmployee[]): KpiMetrics {
  const total = employees.length;
  const left = employees.filter((e) => e.attritionFlag === 1);
  const stayed = employees.filter((e) => e.attritionFlag === 0);
  const exitedCount = left.length;
  const activeCount = stayed.length;
  const attritionRate = total > 0 ? (exitedCount / total) * 100 : 0;
  const retentionRate = total > 0 ? (activeCount / total) * 100 : 0;

  return {
    totalEmployees: total,
    activeEmployees: activeCount,
    exitedEmployees: exitedCount,
    attritionRate: Number(attritionRate.toFixed(1)),
    retentionRate: Number(retentionRate.toFixed(1)),
    avgSatisfaction: Number(mean(employees.map((e) => e.Job_Satisfaction_Score)).toFixed(2)),
    avgSatisfactionStayed: Number(mean(stayed.map((e) => e.Job_Satisfaction_Score)).toFixed(2)),
    avgSatisfactionLeft: Number(mean(left.map((e) => e.Job_Satisfaction_Score)).toFixed(2)),
    avgPerformance: Number(mean(employees.map((e) => e.Performance_Rating)).toFixed(2)),
    avgPerformanceStayed: Number(mean(stayed.map((e) => e.Performance_Rating)).toFixed(2)),
    avgPerformanceLeft: Number(mean(left.map((e) => e.Performance_Rating)).toFixed(2)),
    avgSalary: Math.round(mean(employees.map((e) => e.Salary_NGN))),
    avgSalaryStayed: Math.round(mean(stayed.map((e) => e.Salary_NGN))),
    avgSalaryLeft: Math.round(mean(left.map((e) => e.Salary_NGN))),
    avgActualTenureLeftMonths: Number(mean(left.map((e) => e.actualTenureMonths)).toFixed(1)),
  };
}

function toQuarter(isoDate: string): string {
  const year = isoDate.slice(0, 4);
  const month = Number(isoDate.slice(5, 7));
  const q = Math.ceil(month / 3);
  return `${year} Q${q}`;
}

function toMonth(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function computeAttritionTrend(
  employees: CleanEmployee[],
  granularity: 'quarterly' | 'monthly'
): TrendPoint[] {
  if (employees.length === 0) return [];
  const keyFn = granularity === 'quarterly' ? toQuarter : toMonth;

  const periodSet = new Set<string>();
  const hiresByPeriod: Record<string, number> = {};
  const exitsByPeriod: Record<string, number> = {};

  for (const e of employees) {
    const hKey = keyFn(e.Hire_Date);
    periodSet.add(hKey);
    hiresByPeriod[hKey] = (hiresByPeriod[hKey] ?? 0) + 1;
    if (e.Exit_Date) {
      const eKey = keyFn(e.Exit_Date);
      periodSet.add(eKey);
      exitsByPeriod[eKey] = (exitsByPeriod[eKey] ?? 0) + 1;
    }
  }

  const periods = Array.from(periodSet).sort();
  let runningHeadcount = 0;

  return periods.map((period) => {
    const hires = hiresByPeriod[period] ?? 0;
    const exits = exitsByPeriod[period] ?? 0;
    runningHeadcount = Math.max(0, runningHeadcount + hires - exits);
    const denom = Math.max(1, runningHeadcount + exits);
    return {
      period,
      exits,
      hires,
      activeHeadcount: runningHeadcount,
      attritionRatePct: Number(((exits / denom) * 100).toFixed(1)),
    };
  });
}

export function computeGroupBreakdown(
  employees: CleanEmployee[],
  field: 'Department' | 'Job_Role' | 'Employment_Type'
): GroupAttritionPoint[] {
  const buckets: Record<string, CleanEmployee[]> = {};
  for (const e of employees) {
    const key = e[field];
    buckets[key] ??= [];
    buckets[key].push(e);
  }

  return Object.entries(buckets)
    .map(([name, rows]) => {
      const exits = rows.filter((r) => r.attritionFlag === 1).length;
      return {
        name,
        department: field === 'Job_Role' ? rows[0]?.Department : undefined,
        total: rows.length,
        active: rows.length - exits,
        exits,
        attritionRate: Number(((exits / rows.length) * 100).toFixed(1)),
        avgSalary: Math.round(mean(rows.map((r) => r.Salary_NGN))),
        avgSatisfaction: Number(mean(rows.map((r) => r.Job_Satisfaction_Score)).toFixed(2)),
      };
    })
    .sort((a, b) => b.attritionRate - a.attritionRate || b.exits - a.exits);
}

export function computeDemographicBreakdown(employees: CleanEmployee[]): DemographicPoint[] {
  const order = ['<25', '25-29', '30-34', '35-39', '40-44', '45+'];
  return order.map((ageGroup) => {
    const inBand = employees.filter((e) => e.ageGroup === ageGroup);
    const fem = inBand.filter((e) => e.Gender === 'Female');
    const male = inBand.filter((e) => e.Gender === 'Male');

    const femExits = fem.filter((e) => e.attritionFlag === 1).length;
    const maleExits = male.filter((e) => e.attritionFlag === 1).length;

    const femSup = fem.length > 0 && fem.length < 5;
    const maleSup = male.length > 0 && male.length < 5;

    return {
      ageGroup,
      femaleTotal: fem.length,
      femaleExits: femSup ? 0 : femExits,
      femaleRate:
        fem.length === 0 || femSup
          ? null
          : Number(((femExits / fem.length) * 100).toFixed(1)),
      femaleSuppressed: femSup,
      maleTotal: male.length,
      maleExits: maleSup ? 0 : maleExits,
      maleRate:
        male.length === 0 || maleSup
          ? null
          : Number(((maleExits / male.length) * 100).toFixed(1)),
      maleSuppressed: maleSup,
    };
  });
}

export function computeSalaryBands(employees: CleanEmployee[]): SalaryBandPoint[] {
  const order = ['<₦400k', '₦400k–₦549k', '₦550k–₦699k', '₦700k–₦899k', '₦900k+'];
  return order.map((band) => {
    const rows = employees.filter((e) => e.salaryBand === band);
    const left = rows.filter((e) => e.attritionFlag === 1).length;
    const stayed = rows.length - left;
    return {
      band,
      stayed,
      left,
      total: rows.length,
      attritionRate: rows.length > 0 ? Number(((left / rows.length) * 100).toFixed(1)) : 0,
    };
  });
}

export function computeRatingBreakdown(
  employees: CleanEmployee[],
  field: 'Performance_Rating' | 'Job_Satisfaction_Score'
): RatingAttritionPoint[] {
  return [1, 2, 3, 4, 5].map((score) => {
    const rows = employees.filter((e) => e[field] === score);
    const exits = rows.filter((e) => e.attritionFlag === 1).length;
    return {
      rating: `${score} / 5`,
      numericRating: score,
      total: rows.length,
      exits,
      stayed: rows.length - exits,
      attritionRate: rows.length > 0 ? Number(((exits / rows.length) * 100).toFixed(1)) : 0,
    };
  });
}

export function computeOvertimeSatisfactionHeatmap(employees: CleanEmployee[]): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (const overtime of ['Yes', 'No'] as const) {
    for (let satisfaction = 1; satisfaction <= 5; satisfaction++) {
      const rows = employees.filter(
        (e) => e.Overtime === overtime && e.Job_Satisfaction_Score === satisfaction
      );
      const exits = rows.filter((e) => e.attritionFlag === 1).length;
      cells.push({
        overtime,
        satisfaction,
        total: rows.length,
        exits,
        attritionRate: rows.length > 0 ? Number(((exits / rows.length) * 100).toFixed(1)) : 0,
      });
    }
  }
  return cells;
}

export function computeAbsenceBrackets(employees: CleanEmployee[]): GroupAttritionPoint[] {
  const brackets = [
    { label: '0–4 days', min: 0, max: 4 },
    { label: '5–8 days', min: 5, max: 8 },
    { label: '9–12 days', min: 9, max: 12 },
    { label: '13+ days', min: 13, max: 999 },
  ];
  return brackets.map((b) => {
    const rows = employees.filter((e) => e.Absence_Days >= b.min && e.Absence_Days <= b.max);
    const exits = rows.filter((e) => e.attritionFlag === 1).length;
    return {
      name: b.label,
      total: rows.length,
      active: rows.length - exits,
      exits,
      attritionRate: rows.length > 0 ? Number(((exits / rows.length) * 100).toFixed(1)) : 0,
      avgSalary: Math.round(mean(rows.map((r) => r.Salary_NGN))),
      avgSatisfaction: Number(mean(rows.map((r) => r.Job_Satisfaction_Score)).toFixed(2)),
    };
  });
}

export function generateAutomatedInsights(employees: CleanEmployee[]): AutomatedInsight[] {
  if (employees.length < 5) {
    return [
      {
        id: 'small-sample',
        category: 'Sample Size',
        headline: 'Filtered view contains fewer than 5 employees',
        explanation:
          'Broaden active filters to surface statistically reliable department, compensation, and tenure patterns.',
        metricValue: `${employees.length} records`,
        severity: 'notable',
      },
    ];
  }

  const kpis = computeKpis(employees);
  const depts = computeGroupBreakdown(employees, 'Department').filter((d) => d.total >= 5);
  const roles = computeGroupBreakdown(employees, 'Job_Role').filter((r) => r.total >= 5);
  const empTypes = computeGroupBreakdown(employees, 'Employment_Type');
  const satGroups = computeRatingBreakdown(employees, 'Job_Satisfaction_Score');

  const insights: AutomatedInsight[] = [];

  // 1. Department Hotspot
  if (depts.length >= 2) {
    const topDept = depts[0];
    const lowDept = depts[depts.length - 1];
    const diff = (topDept.attritionRate - kpis.attritionRate).toFixed(1);
    insights.push({
      id: 'dept-hotspot',
      category: 'Department Concentration',
      headline: `${topDept.name} records the highest attrition rate at ${topDept.attritionRate}%`,
      explanation: `${topDept.exits} of ${topDept.total} employees in ${topDept.name} exited (${Number(diff) >= 0 ? '+' : ''}${diff} pts vs. the ${kpis.attritionRate}% cohort average), compared to ${lowDept.attritionRate}% in ${lowDept.name}.`,
      metricValue: `${topDept.attritionRate}%`,
      severity: topDept.attritionRate > kpis.attritionRate + 5 ? 'elevated' : 'notable',
    });
  }

  // 2. Job Role Turnover
  if (roles.length >= 1) {
    const topRole = roles[0];
    insights.push({
      id: 'role-turnover',
      category: 'Role Exposure',
      headline: `${topRole.name} shows elevated turnover (${topRole.attritionRate}%)`,
      explanation: `Among roles with at least 5 employees, ${topRole.name} (${topRole.department}) recorded ${topRole.exits} exits out of ${topRole.total} staff. Role-specific workload and career pathing warrant review.`,
      metricValue: `${topRole.exits}/${topRole.total} exits`,
      severity: topRole.attritionRate >= 30 ? 'elevated' : 'notable',
    });
  }

  // 3. Overtime Association
  const otYes = employees.filter((e) => e.Overtime === 'Yes');
  const otNo = employees.filter((e) => e.Overtime === 'No');
  if (otYes.length >= 5 && otNo.length >= 5) {
    const rateYes = (otYes.filter((e) => e.attritionFlag === 1).length / otYes.length) * 100;
    const rateNo = (otNo.filter((e) => e.attritionFlag === 1).length / otNo.length) * 100;
    const gap = rateYes - rateNo;
    insights.push({
      id: 'overtime-pattern',
      category: 'Workload & Overtime',
      headline: `Overtime is associated with a ${Math.abs(gap).toFixed(1)}-point ${gap >= 0 ? 'higher' : 'lower'} exit rate`,
      explanation: `Employees logging overtime exited at ${rateYes.toFixed(1)}% (${otYes.filter((e) => e.attritionFlag === 1).length}/${otYes.length}), whereas non-overtime staff exited at ${rateNo.toFixed(1)}%. While correlation does not establish causation, workload monitoring is advised.`,
      metricValue: `${rateYes.toFixed(1)}% vs ${rateNo.toFixed(1)}%`,
      severity: gap >= 5 ? 'elevated' : 'notable',
    });
  }

  // 4. Job Satisfaction & Lowest Satisfaction Department
  const lowSat = satGroups.find((s) => s.numericRating === 1);
  const lowestSatDept = [...depts].sort((a, b) => a.avgSatisfaction - b.avgSatisfaction)[0];
  if (lowSat && lowSat.total >= 5) {
    insights.push({
      id: 'satisfaction-pattern',
      category: 'Job Satisfaction',
      headline: `Lowest satisfaction tier (1/5) exhibits ${lowSat.attritionRate}% attrition`,
      explanation: `${lowSat.exits} of ${lowSat.total} employees scoring 1/5 on satisfaction have exited.${lowestSatDept ? ` ${lowestSatDept.name} averages the lowest satisfaction score (${lowestSatDept.avgSatisfaction}/5).` : ''}`,
      metricValue: `${lowSat.attritionRate}% exit rate`,
      severity: lowSat.attritionRate > kpis.attritionRate + 5 ? 'elevated' : 'notable',
    });
  }

  // 5. Compensation Pattern
  if (kpis.exitedEmployees >= 5 && kpis.activeEmployees >= 5) {
    const salDiff = kpis.avgSalaryStayed - kpis.avgSalaryLeft;
    const salPct = kpis.avgSalaryStayed > 0 ? (salDiff / kpis.avgSalaryStayed) * 100 : 0;
    insights.push({
      id: 'salary-pattern',
      category: 'Compensation Differential',
      headline: `Exited employees earned ${Math.abs(salPct).toFixed(1)}% ${salDiff >= 0 ? 'less' : 'more'} on average`,
      explanation: `Mean monthly salary among exited staff is ₦${kpis.avgSalaryLeft.toLocaleString('en-US')} compared to ₦${kpis.avgSalaryStayed.toLocaleString('en-US')} among retained employees. Pay competitiveness may interact with role mix.`,
      metricValue: `₦${Math.abs(salDiff).toLocaleString('en-US')} gap`,
      severity: salDiff > 30000 ? 'notable' : 'protective',
    });
  }

  // 6. Tenure Pattern Among Exits
  const exitedList = employees.filter((e) => e.attritionFlag === 1);
  if (exitedList.length >= 5) {
    const under24 = exitedList.filter((e) => e.actualTenureMonths <= 24).length;
    const pctUnder24 = (under24 / exitedList.length) * 100;
    insights.push({
      id: 'tenure-pattern',
      category: 'Tenure at Exit',
      headline: `${pctUnder24.toFixed(0)}% of exits occurred within the first 24 months`,
      explanation: `Average completed tenure among exited staff is ${kpis.avgActualTenureLeftMonths} months (${under24} of ${exitedList.length} departures occurred within two years of hire). Early-career onboarding and role alignment are key focus areas.`,
      metricValue: `${kpis.avgActualTenureLeftMonths} mo avg`,
      severity: pctUnder24 >= 45 ? 'elevated' : 'notable',
    });
  }

  // 7. Performance & Employment Type Context
  const lowPerf = employees.filter((e) => e.Performance_Rating <= 2);
  const highPerf = employees.filter((e) => e.Performance_Rating >= 4);
  if (lowPerf.length >= 5 && highPerf.length >= 5) {
    const lowRate = (lowPerf.filter((e) => e.attritionFlag === 1).length / lowPerf.length) * 100;
    const highRate = (highPerf.filter((e) => e.attritionFlag === 1).length / highPerf.length) * 100;
    const topEmpType = empTypes[0];
    insights.push({
      id: 'perf-emptype',
      category: 'Performance & Contract Type',
      headline: `High performers (4–5/5) exit at ${highRate.toFixed(1)}% vs ${lowRate.toFixed(1)}% for ratings 1–2`,
      explanation: `Attrition persists across high-performing contributors rather than solely low ratings.${topEmpType ? ` Across employment categories, ${topEmpType.name} staff show the highest exit rate at ${topEmpType.attritionRate}%.` : ''}`,
      metricValue: `${highRate.toFixed(1)}% high-perf exits`,
      severity: 'notable',
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'cohort-summary',
      category: 'Cohort Summary',
      headline: `Overall attrition stands at ${kpis.attritionRate}% across ${kpis.totalEmployees} records`,
      explanation: `${kpis.exitedEmployees} employees exited and ${kpis.activeEmployees} remained active (${kpis.retentionRate}% retention). Subgroup comparisons require at least 5 records per segment.`,
      metricValue: `${kpis.exitedEmployees}/${kpis.totalEmployees} exits`,
      severity: kpis.attritionRate >= 25 ? 'elevated' : 'notable',
    });
  }

  return insights;
}
