import Papa from 'papaparse';
import type {
  CanonicalField,
  CleanEmployee,
  ColumnMapping,
  ColumnMissingStat,
  DataQualityReport,
} from './types.ts';

export const REQUIRED_COLUMNS: readonly CanonicalField[] = [
  'Employee_ID',
  'Age',
  'Gender',
  'Department',
  'Job_Role',
  'Employment_Type',
  'Hire_Date',
  'Salary_NGN',
  'Performance_Rating',
  'Training_Hours',
  'Absence_Days',
  'Job_Satisfaction_Score',
  'Overtime',
  'Manager',
  'Employment_Status',
  'Exit_Date',
  'Attrition_Status',
] as const;

export interface CanonicalFieldMeta {
  field: CanonicalField;
  label: string;
  required: boolean;
  defaultNote: string;
  aliases: string[];
}

export const CANONICAL_FIELD_SPECS: CanonicalFieldMeta[] = [
  {
    field: 'Attrition_Status',
    label: 'Attrition Target (Yes/No, 1/0)',
    required: true,
    defaultNote: 'Required target column',
    aliases: ['attrition_status', 'attrition', 'left', 'exited', 'turnover', 'terminated', 'churn', 'target'],
  },
  {
    field: 'Employee_ID',
    label: 'Employee ID',
    required: false,
    defaultNote: 'Auto-generated (EMP0001…) if unmapped',
    aliases: ['employee_id', 'employeenumber', 'emp_id', 'empid', 'staff_id', 'id', 'worker_id'],
  },
  {
    field: 'Department',
    label: 'Department',
    required: false,
    defaultNote: 'Defaults to "General"',
    aliases: ['department', 'dept', 'division', 'business_unit', 'team', 'unit'],
  },
  {
    field: 'Job_Role',
    label: 'Job Role / Title',
    required: false,
    defaultNote: 'Defaults to "Staff"',
    aliases: ['job_role', 'jobrole', 'role', 'job_title', 'title', 'position', 'occupation'],
  },
  {
    field: 'Employment_Type',
    label: 'Employment Type',
    required: false,
    defaultNote: 'Defaults to "Full-time"',
    aliases: ['employment_type', 'work_type', 'contract_type', 'emp_type', 'schedule'],
  },
  {
    field: 'Salary_NGN',
    label: 'Monthly Compensation / Salary',
    required: false,
    defaultNote: 'Defaults to median or 500,000',
    aliases: ['salary_ngn', 'monthlyincome', 'monthly_income', 'salary', 'monthly_salary', 'compensation', 'pay', 'base_salary', 'wage'],
  },
  {
    field: 'Job_Satisfaction_Score',
    label: 'Job Satisfaction (1–5)',
    required: false,
    defaultNote: 'Defaults to 3 (neutral); rescales if >5',
    aliases: ['job_satisfaction_score', 'jobsatisfaction', 'satisfaction_score', 'satisfaction', 'engagementscore'],
  },
  {
    field: 'Performance_Rating',
    label: 'Performance Rating (1–5)',
    required: false,
    defaultNote: 'Defaults to 3; rescales if >5',
    aliases: ['performance_rating', 'performancerating', 'perf_rating', 'perf_score', 'rating', 'evaluation'],
  },
  {
    field: 'Overtime',
    label: 'Overtime (Yes/No)',
    required: false,
    defaultNote: 'Defaults to "No"',
    aliases: ['overtime', 'over_time', 'ot', 'extra_hours'],
  },
  {
    field: 'Hire_Date',
    label: 'Hire Date',
    required: false,
    defaultNote: 'Defaults to 2024-01-01 if absent',
    aliases: ['hire_date', 'hiredate', 'start_date', 'startdate', 'date_of_hire', 'joining_date', 'joined'],
  },
  {
    field: 'Exit_Date',
    label: 'Exit / Termination Date',
    required: false,
    defaultNote: 'Optional (null for Active staff)',
    aliases: ['exit_date', 'exitdate', 'termination_date', 'leave_date', 'end_date', 'resignation_date'],
  },
  {
    field: 'Training_Hours',
    label: 'Training Hours',
    required: false,
    defaultNote: 'Defaults to 20 hrs',
    aliases: ['training_hours', 'trainingtimeslastyear', 'training', 'learning_hours'],
  },
  {
    field: 'Absence_Days',
    label: 'Absence Days',
    required: false,
    defaultNote: 'Defaults to 5 days',
    aliases: ['absence_days', 'absences', 'days_absent', 'sick_days', 'leave_days'],
  },
  {
    field: 'Manager',
    label: 'Manager / Supervisor',
    required: false,
    defaultNote: 'Defaults to "Unassigned"',
    aliases: ['manager', 'supervisor', 'manager_name', 'lead', 'reports_to'],
  },
  {
    field: 'Employment_Status',
    label: 'Employment Status',
    required: false,
    defaultNote: 'Inferred from Attrition Target',
    aliases: ['employment_status', 'emp_status', 'status', 'active_status'],
  },
  {
    field: 'Age',
    label: 'Age (Demographics / Fairness)',
    required: false,
    defaultNote: 'Defaults to 32',
    aliases: ['age', 'employee_age'],
  },
  {
    field: 'Gender',
    label: 'Gender (Demographics / Fairness)',
    required: false,
    defaultNote: 'Defaults to "Unspecified"',
    aliases: ['gender', 'sex'],
  },
];

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const mapping = {} as ColumnMapping;
  const usedHeaders = new Set<string>();

  for (const spec of CANONICAL_FIELD_SPECS) {
    mapping[spec.field] = null;
    // Exact case-insensitive match first
    const exact = headers.find(
      (h) => !usedHeaders.has(h) && h.trim().toLowerCase() === spec.field.toLowerCase()
    );
    if (exact) {
      mapping[spec.field] = exact;
      usedHeaders.add(exact);
      continue;
    }
    // Normalized alias match
    const normalizedAliases = spec.aliases.map(normalizeKey);
    const aliasMatch = headers.find(
      (h) => !usedHeaders.has(h) && normalizedAliases.includes(normalizeKey(h))
    );
    if (aliasMatch) {
      mapping[spec.field] = aliasMatch;
      usedHeaders.add(aliasMatch);
    }
  }

  return mapping;
}

function parseFlexibleDate(rawVal: string): string | null {
  const val = normalizeText(rawVal);
  if (!val) return null;

  // 1. Strict ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const d = new Date(`${val}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === val ? val : null;
  }

  // 2. YYYY/MM/DD
  const ymdSlash = val.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdSlash) {
    const iso = `${ymdSlash[1]}-${ymdSlash[2].padStart(2, '0')}-${ymdSlash[3].padStart(2, '0')}`;
    const d = new Date(`${iso}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) ? iso : null;
  }

  // 3. MM/DD/YYYY or DD/MM/YYYY (prefer MM/DD unless first > 12)
  const slashOrDash = val.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slashOrDash) {
    const a = Number(slashOrDash[1]);
    const b = Number(slashOrDash[2]);
    const y = slashOrDash[3];
    let month = a;
    let day = b;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    }
    const iso = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = new Date(`${iso}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.getUTCMonth() + 1 === month ? iso : null;
  }

  // 4. Fallback native Date parse (e.g. "Jan 15, 2023" or ISO datetime)
  const parsed = new Date(val);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeText(val: unknown): string {
  return String(val ?? '').trim().replace(/\s+/g, ' ');
}

function standardizeGender(val: string): string {
  const lower = normalizeText(val).toLowerCase();
  if (lower === 'f' || lower === 'female') return 'Female';
  if (lower === 'm' || lower === 'male') return 'Male';
  return normalizeText(val) || 'Unspecified';
}

function standardizeAttritionFlag(val: string): 'Yes' | 'No' | null {
  const lower = normalizeText(val).toLowerCase();
  if (['yes', 'y', '1', 'true', 'exited', 'left', 'terminated', 'resigned', 'churned'].includes(lower)) {
    return 'Yes';
  }
  if (['no', 'n', '0', 'false', 'active', 'stayed', 'retained', 'current'].includes(lower)) {
    return 'No';
  }
  return null;
}

function standardizeYesNo(val: string): 'Yes' | 'No' | null {
  const lower = normalizeText(val).toLowerCase();
  if (['yes', 'y', '1', 'true'].includes(lower)) return 'Yes';
  if (['no', 'n', '0', 'false'].includes(lower)) return 'No';
  return null;
}

function standardizeEmploymentType(val: string): string {
  const lower = normalizeText(val).toLowerCase();
  if (lower.includes('full')) return 'Full-time';
  if (lower.includes('part')) return 'Part-time';
  if (lower.includes('contract') || lower.includes('temp') || lower.includes('freelance')) return 'Contract';
  return normalizeText(val) || 'Full-time';
}

export function getAgeGroup(age: number): string {
  if (age < 25) return '<25';
  if (age <= 29) return '25-29';
  if (age <= 34) return '30-34';
  if (age <= 39) return '35-39';
  if (age <= 44) return '40-44';
  return '45+';
}

export function getSalaryBand(salary: number): string {
  if (salary < 400000) return '<₦400k';
  if (salary < 550000) return '₦400k–₦549k';
  if (salary < 700000) return '₦550k–₦699k';
  if (salary < 900000) return '₦700k–₦899k';
  return '₦900k+';
}

export function parseAndCleanDataset(
  csvText: string,
  customMapping?: Partial<ColumnMapping>
): {
  employees: CleanEmployee[];
  qualityReport: DataQualityReport;
  appliedMapping: ColumnMapping;
} {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0) {
    throw new Error('Could not detect any CSV column headers.');
  }

  const autoMapping = suggestColumnMapping(headers);
  const appliedMapping: ColumnMapping = { ...autoMapping };
  if (customMapping) {
    for (const field of REQUIRED_COLUMNS) {
      if (field in customMapping) {
        const candidate = customMapping[field];
        appliedMapping[field] = candidate && headers.includes(candidate) ? candidate : null;
      }
    }
  }

  if (!appliedMapping.Attrition_Status) {
    throw new Error(
      'Please map the Attrition Target column (e.g., Attrition_Status, Attrition, Left, or Exited).'
    );
  }

  const rawRows = parsed.data;
  if (rawRows.length === 0) {
    throw new Error('The uploaded CSV contains zero data rows.');
  }

  const getCell = (row: Record<string, string>, field: CanonicalField): string => {
    const col = appliedMapping[field];
    return col ? normalizeText(row[col]) : '';
  };

  const missingCounts: Record<string, number> = {};
  for (const col of REQUIRED_COLUMNS) {
    missingCounts[col] = 0;
  }

  for (const row of rawRows) {
    for (const col of REQUIRED_COLUMNS) {
      if (!appliedMapping[col]) {
        missingCounts[col] += 1;
      } else {
        const val = getCell(row, col);
        if (!val) missingCounts[col] += 1;
      }
    }
  }

  // Detect max observed scale for Performance_Rating and Job_Satisfaction_Score to support 1-4, 1-5, or 1-10 scales
  let maxPerfObserved = 5;
  let maxSatObserved = 5;
  if (appliedMapping.Performance_Rating) {
    const vals = rawRows
      .map((r) => Number(getCell(r, 'Performance_Rating')))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (vals.length > 0) maxPerfObserved = Math.max(...vals);
  }
  if (appliedMapping.Job_Satisfaction_Score) {
    const vals = rawRows
      .map((r) => Number(getCell(r, 'Job_Satisfaction_Score')))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (vals.length > 0) maxSatObserved = Math.max(...vals);
  }

  // Compute fallback median salary from mapped salary column if partially missing
  let medianSalaryFallback = 500000;
  if (appliedMapping.Salary_NGN) {
    const validSals = rawRows
      .map((r) => Number(getCell(r, 'Salary_NGN').replace(/[^0-9.]/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    if (validSals.length > 0) {
      medianSalaryFallback = validSals[Math.floor(validSals.length / 2)];
    }
  }

  const seenIds = new Set<string>();
  let duplicatesRemoved = 0;
  let invalidRowsDropped = 0;
  let currencyEncodingFixed = 0;
  let statusConsistencyMismatches = 0;
  let exitDateAnomalies = 0;
  const validationWarnings: string[] = [];

  interface IntermediateRow {
    Employee_ID: string;
    Age: number;
    Gender: string;
    Department: string;
    Job_Role: string;
    Employment_Type: string;
    Hire_Date: string;
    Salary_NGN: number;
    Performance_Rating: number;
    Training_Hours: number;
    Absence_Days: number;
    Job_Satisfaction_Score: number;
    Overtime: 'Yes' | 'No';
    Manager: string;
    Employment_Status: 'Active' | 'Exited';
    Exit_Date: string | null;
    Attrition_Status: 'Yes' | 'No';
  }

  const validIntermediate: IntermediateRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];

    const empIdRaw = appliedMapping.Employee_ID
      ? getCell(raw, 'Employee_ID').toUpperCase()
      : `EMP${String(i + 1).padStart(4, '0')}`;
    if (!empIdRaw) {
      invalidRowsDropped += 1;
      continue;
    }
    if (seenIds.has(empIdRaw)) {
      duplicatesRemoved += 1;
      continue;
    }
    seenIds.add(empIdRaw);

    let attrition = standardizeAttritionFlag(getCell(raw, 'Attrition_Status'));
    const empStatusRaw = getCell(raw, 'Employment_Status').toLowerCase();
    const statusSaysExited =
      empStatusRaw === 'exited' || empStatusRaw === 'terminated' || empStatusRaw === 'left';

    if (!attrition) {
      if (appliedMapping.Employment_Status && empStatusRaw) {
        attrition = statusSaysExited ? 'Yes' : 'No';
        statusConsistencyMismatches += 1;
      } else {
        invalidRowsDropped += 1;
        continue;
      }
    } else if (appliedMapping.Employment_Status && empStatusRaw && (attrition === 'Yes') !== statusSaysExited) {
      statusConsistencyMismatches += 1;
    }

    // Salary
    const rawSalary = getCell(raw, 'Salary_NGN');
    if (rawSalary && (rawSalary.includes('?') || rawSalary.includes('₦') || rawSalary.includes('$') || rawSalary.includes(','))) {
      currencyEncodingFixed += 1;
    }
    const parsedSal = rawSalary ? Number(rawSalary.replace(/[^0-9.]/g, '')) : medianSalaryFallback;
    const salaryNum = Number.isFinite(parsedSal) && parsedSal > 0 ? parsedSal : medianSalaryFallback;

    // Age
    const rawAge = getCell(raw, 'Age');
    const parsedAge = rawAge ? Number(rawAge) : 32;
    const age = Number.isFinite(parsedAge) && parsedAge >= 16 && parsedAge <= 85 ? parsedAge : 32;

    // Ratings (auto-rescale if dataset uses > 5 scale)
    const rawPerf = getCell(raw, 'Performance_Rating');
    let perf = rawPerf ? Number(rawPerf) : 3;
    if (!Number.isFinite(perf) || perf < 1) perf = 3;
    if (maxPerfObserved > 5) {
      perf = 1 + ((perf - 1) / (maxPerfObserved - 1)) * 4;
    }
    perf = Math.min(5, Math.max(1, Math.round(perf)));

    const rawSat = getCell(raw, 'Job_Satisfaction_Score');
    let sat = rawSat ? Number(rawSat) : 3;
    if (!Number.isFinite(sat) || sat < 1) sat = 3;
    if (maxSatObserved > 5) {
      sat = 1 + ((sat - 1) / (maxSatObserved - 1)) * 4;
    }
    sat = Math.min(5, Math.max(1, Math.round(sat)));

    const rawTrain = getCell(raw, 'Training_Hours');
    const training = rawTrain && Number.isFinite(Number(rawTrain)) && Number(rawTrain) >= 0 ? Number(rawTrain) : 20;

    const rawAbs = getCell(raw, 'Absence_Days');
    const absence = rawAbs && Number.isFinite(Number(rawAbs)) && Number(rawAbs) >= 0 ? Number(rawAbs) : 5;

    const overtime = appliedMapping.Overtime
      ? standardizeYesNo(getCell(raw, 'Overtime')) ?? 'No'
      : 'No';

    const hireDateRaw = getCell(raw, 'Hire_Date');
    const hireDate = appliedMapping.Hire_Date
      ? parseFlexibleDate(hireDateRaw)
      : '2024-01-01';
    if (!hireDate) {
      invalidRowsDropped += 1;
      continue;
    }

    const exitDateRaw = getCell(raw, 'Exit_Date');
    let exitDate = appliedMapping.Exit_Date && exitDateRaw ? parseFlexibleDate(exitDateRaw) : null;
    if (appliedMapping.Exit_Date && exitDateRaw && !exitDate) {
      exitDateAnomalies += 1;
    }

    if (appliedMapping.Exit_Date) {
      if (attrition === 'Yes' && !exitDate) exitDateAnomalies += 1;
      if (attrition === 'No' && exitDate) {
        exitDateAnomalies += 1;
        exitDate = null;
      }
      if (exitDate && exitDate < hireDate) {
        exitDateAnomalies += 1;
        invalidRowsDropped += 1;
        continue;
      }
    }

    const dept = getCell(raw, 'Department') || 'General';
    const role = getCell(raw, 'Job_Role') || (dept !== 'General' ? `${dept} Staff` : 'Staff');

    validIntermediate.push({
      Employee_ID: empIdRaw,
      Age: Math.round(age),
      Gender: appliedMapping.Gender ? standardizeGender(getCell(raw, 'Gender')) : 'Unspecified',
      Department: dept,
      Job_Role: role,
      Employment_Type: appliedMapping.Employment_Type
        ? standardizeEmploymentType(getCell(raw, 'Employment_Type'))
        : 'Full-time',
      Hire_Date: hireDate,
      Salary_NGN: Math.round(salaryNum),
      Performance_Rating: perf,
      Training_Hours: Math.round(training),
      Absence_Days: Math.round(absence),
      Job_Satisfaction_Score: sat,
      Overtime: overtime,
      Manager: getCell(raw, 'Manager') || 'Unassigned',
      Employment_Status: attrition === 'Yes' ? 'Exited' : 'Active',
      Exit_Date: attrition === 'Yes' ? exitDate : null,
      Attrition_Status: attrition,
    });
  }

  if (validIntermediate.length === 0) {
    throw new Error(
      'No valid employee records remained after cleaning. Verify that your Attrition Target column contains Yes/No, 1/0, or Active/Exited values.'
    );
  }

  let minHire = validIntermediate[0].Hire_Date;
  let maxHire = validIntermediate[0].Hire_Date;
  let minExit: string | null = null;
  let maxExit: string | null = null;
  let maxObservedDate = validIntermediate[0].Hire_Date;

  for (const r of validIntermediate) {
    if (r.Hire_Date < minHire) minHire = r.Hire_Date;
    if (r.Hire_Date > maxHire) maxHire = r.Hire_Date;
    if (r.Hire_Date > maxObservedDate) maxObservedDate = r.Hire_Date;
    if (r.Exit_Date) {
      if (!minExit || r.Exit_Date < minExit) minExit = r.Exit_Date;
      if (!maxExit || r.Exit_Date > maxExit) maxExit = r.Exit_Date;
      if (r.Exit_Date > maxObservedDate) maxObservedDate = r.Exit_Date;
    }
  }

  const snapshotDateObj = new Date(`${maxObservedDate}T00:00:00Z`);
  snapshotDateObj.setUTCDate(snapshotDateObj.getUTCDate() + 1);
  const snapshotDate = snapshotDateObj.toISOString().slice(0, 10);
  const snapshotTs = snapshotDateObj.getTime();

  const employees: CleanEmployee[] = validIntermediate.map((r) => {
    const hireTs = new Date(`${r.Hire_Date}T00:00:00Z`).getTime();
    const exitTs = r.Exit_Date ? new Date(`${r.Exit_Date}T00:00:00Z`).getTime() : snapshotTs;
    const tenureSinceHireMonths = Math.max(0.5, Number(((snapshotTs - hireTs) / MS_PER_MONTH).toFixed(1)));
    const actualTenureMonths = Math.max(0.5, Number(((exitTs - hireTs) / MS_PER_MONTH).toFixed(1)));

    return {
      ...r,
      attritionFlag: r.Attrition_Status === 'Yes' ? 1 : 0,
      tenureSinceHireMonths,
      actualTenureMonths,
      ageGroup: getAgeGroup(r.Age),
      salaryBand: getSalaryBand(r.Salary_NGN),
    };
  });

  const missingByColumn: ColumnMissingStat[] = REQUIRED_COLUMNS.map((col) => {
    const missingCount = missingCounts[col] ?? 0;
    return {
      column: col,
      missingCount,
      missingPct: Number(((missingCount / rawRows.length) * 100).toFixed(1)),
    };
  });

  const unmappedOptional = REQUIRED_COLUMNS.filter(
    (col) => col !== 'Attrition_Status' && !appliedMapping[col]
  );

  if (unmappedOptional.length > 0) {
    validationWarnings.push(
      `Unmapped optional fields (${unmappedOptional.join(', ')}) were populated using documented default values.`
    );
  }
  if (currencyEncodingFixed > 0) {
    validationWarnings.push(
      `Normalized ${currencyEncodingFixed} salary values containing currency symbols ("?", "₦", "$") or comma formatting.`
    );
  }
  if (duplicatesRemoved > 0) {
    validationWarnings.push(`Removed ${duplicatesRemoved} duplicate Employee_ID records.`);
  }
  if (invalidRowsDropped > 0) {
    validationWarnings.push(`Excluded ${invalidRowsDropped} records with invalid target labels or malformed dates.`);
  }
  if (statusConsistencyMismatches > 0) {
    validationWarnings.push(
      `Reconciled ${statusConsistencyMismatches} records where Employment_Status and Attrition_Status differed.`
    );
  }

  const assumptions: string[] = [
    `Dataset snapshot reference date is anchored at ${snapshotDate} (one day after the latest observed Hire_Date or Exit_Date).`,
    `To prevent target leakage, Exit_Date, Employment_Status, and exit-derived tenure are strictly excluded from all predictive ML models.`,
    `Age and Gender are excluded as predictive inputs in the ML models to prevent demographic bias in individual risk scoring.`,
    `In demographic breakdowns (Gender × Age Group), subgroups with fewer than 5 employees (n < 5) are suppressed for privacy.`,
  ];

  if (maxPerfObserved > 5) {
    assumptions.push(
      `Performance_Rating values (max ${maxPerfObserved}) were linearly rescaled to the 1–5 dashboard scale.`
    );
  }
  if (maxSatObserved > 5) {
    assumptions.push(
      `Job_Satisfaction_Score values (max ${maxSatObserved}) were linearly rescaled to the 1–5 dashboard scale.`
    );
  }

  return {
    employees,
    appliedMapping,
    qualityReport: {
      rawRowCount: rawRows.length,
      validRowCount: employees.length,
      duplicatesRemoved,
      invalidRowsDropped,
      currencyEncodingFixed,
      statusConsistencyMismatches,
      exitDateAnomalies,
      snapshotDate,
      dateRange: {
        minHireDate: minHire,
        maxHireDate: maxHire,
        minExitDate: minExit,
        maxExitDate: maxExit,
      },
      missingByColumn,
      assumptions,
      validationWarnings,
    },
  };
}
