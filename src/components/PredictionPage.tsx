import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Scale,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ModelId,
  PredictionInput,
  PredictionResult,
  TrainingSummary,
  WorkspacePayload,
} from '../shared/types.ts';

interface PredictionPageProps {
  options: WorkspacePayload['options'];
  trainingSummary: TrainingSummary;
  initialInput: PredictionInput;
  onSelectModel: (modelId: ModelId) => Promise<void>;
  isDark?: boolean;
}

const RiskGauge: React.FC<{
  probabilityPct: number;
  classification: string;
  isDark?: boolean;
}> = ({ probabilityPct, classification, isDark = false }) => {
  const clamped = Math.min(100, Math.max(0, probabilityPct));
  // Semi-circle arc from 180deg to 0deg
  const radius = 84;
  const cx = 110;
  const cy = 104;
  const circumference = Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  const strokeColor =
    clamped >= 65
      ? isDark
        ? '#D94668'
        : '#6D132B'
      : clamped >= 35
      ? '#D97706'
      : '#15803D';

  const trackColor = isDark ? '#27272A' : '#E4E4E7';
  const needleColor = isDark ? '#F4F4F5' : '#18181B';

  const angleRad = Math.PI - (clamped / 100) * Math.PI;
  const needleX = cx + (radius - 14) * Math.cos(angleRad);
  const needleY = cy - (radius - 14) * Math.sin(angleRad);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 124" className="w-full max-w-[260px]" role="img" aria-label={`Risk gauge showing ${clamped}% ${classification}`}>
        {/* Track arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={trackColor}
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Active fill arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 320ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
        {/* Needle marker */}
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke={needleColor}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="5" fill={needleColor} />

        <text
          x={cx}
          y={cy - 24}
          textAnchor="middle"
          className="font-display font-bold fill-zinc-900 dark:fill-zinc-100"
          style={{ fontSize: '28px', fontVariantNumeric: 'tabular-nums' }}
        >
          {clamped}%
        </text>
        <text
          x={26}
          y={cy + 16}
          textAnchor="middle"
          className="fill-zinc-400 dark:fill-zinc-500"
          style={{ fontSize: '10px' }}
        >
          0%
        </text>
        <text
          x={cx}
          y={12}
          textAnchor="middle"
          className="fill-zinc-400 dark:fill-zinc-500"
          style={{ fontSize: '10px' }}
        >
          50%
        </text>
        <text
          x={194}
          y={cy + 16}
          textAnchor="middle"
          className="fill-zinc-400 dark:fill-zinc-500"
          style={{ fontSize: '10px' }}
        >
          100%
        </text>
      </svg>

      <div className="mt-1 flex items-center gap-2">
        {classification === 'High Risk' ? (
          <AlertTriangle className="h-4 w-4 text-[#6D132B] dark:text-rose-400" />
        ) : classification === 'Medium Risk' ? (
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
        )}
        <span
          className={`font-display text-sm font-bold ${
            classification === 'High Risk'
              ? 'text-[#6D132B] dark:text-rose-400'
              : classification === 'Medium Risk'
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {classification}
        </span>
      </div>
    </div>
  );
};

export const PredictionPage: React.FC<PredictionPageProps> = ({
  options,
  trainingSummary,
  initialInput,
  onSelectModel,
  isDark = false,
}) => {
  const [form, setForm] = useState<PredictionInput>(initialInput);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [switchingModel, setSwitchingModel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initialInput);
    runPrediction(initialInput, trainingSummary.activeModelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInput]);

  const rolesForDept =
    options.rolesByDepartment[form.Department] ?? options.jobRoles;
  const managersForDept =
    options.managersByDepartment[form.Department] ?? options.managers;

  const updateField = <K extends keyof PredictionInput>(
    key: K,
    value: PredictionInput[K]
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'Department') {
        const deptStr = String(value);
        const validRoles = options.rolesByDepartment[deptStr] ?? options.jobRoles;
        if (!validRoles.includes(next.Job_Role)) {
          next.Job_Role = validRoles[0] ?? next.Job_Role;
        }
        const validMgrs = options.managersByDepartment[deptStr] ?? options.managers;
        if (!validMgrs.includes(next.Manager)) {
          next.Manager = validMgrs[0] ?? next.Manager;
        }
      }
      return next;
    });
  };

  const runPrediction = async (inputData: PredictionInput, modelId: ModelId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputData, modelId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Prediction request failed.');
      }
      setPrediction(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to compute prediction.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runPrediction(form, trainingSummary.activeModelId);
  };

  const loadPreset = (preset: 'high' | 'low') => {
    const sample: PredictionInput =
      preset === 'high'
        ? {
            Age: 29,
            Gender: options.genders[0] ?? 'Female',
            Department: options.departments.includes('Customer Support')
              ? 'Customer Support'
              : options.departments[0],
            Job_Role: options.jobRoles.includes('Customer Support Officer')
              ? 'Customer Support Officer'
              : options.jobRoles[0],
            Employment_Type: 'Full-time',
            Salary_NGN: 315000,
            Performance_Rating: 3,
            Training_Hours: 8,
            Absence_Days: 14,
            Job_Satisfaction_Score: 1,
            Overtime: 'Yes',
            Manager: options.managers.includes('Customer Manager 3')
              ? 'Customer Manager 3'
              : options.managers[0],
            Hire_Date: '2025-05-01',
          }
        : {
            Age: 41,
            Gender: options.genders[1] ?? options.genders[0] ?? 'Male',
            Department: options.departments.includes('Project Management')
              ? 'Project Management'
              : options.departments[0],
            Job_Role: options.jobRoles.includes('Project Manager')
              ? 'Project Manager'
              : options.jobRoles[0],
            Employment_Type: 'Full-time',
            Salary_NGN: 880000,
            Performance_Rating: 4,
            Training_Hours: 42,
            Absence_Days: 2,
            Job_Satisfaction_Score: 5,
            Overtime: 'No',
            Manager: options.managers.includes('Project Manager 3')
              ? 'Project Manager 3'
              : options.managers[0],
            Hire_Date: '2019-06-01',
          };
    setForm(sample);
    runPrediction(sample, trainingSummary.activeModelId);
  };

  const activeEval =
    trainingSummary.models.find((m) => m.modelId === trainingSummary.activeModelId) ??
    trainingSummary.models[0];

  const handleModelSwitch = async (id: ModelId) => {
    setSwitchingModel(true);
    try {
      await onSelectModel(id);
      await runPrediction(form, id);
    } finally {
      setSwitchingModel(false);
    }
  };

  const chartGrid = isDark ? '#27272A' : '#E4E4E7';
  const chartTick = isDark ? '#A1A1AA' : '#71717A';
  const chartLabelTick = isDark ? '#E4E4E7' : '#27272A';
  const accentPrimary = isDark ? '#D94668' : '#6D132B';
  const accentSecondary = isDark ? '#A32948' : '#9E2A47';
  const tooltipStyle = isDark
    ? {
        backgroundColor: '#18181B',
        border: '1px solid #3F3F46',
        borderRadius: '8px',
        color: '#F4F4F5',
        fontSize: '11px',
      }
    : {
        backgroundColor: '#FFFFFF',
        border: '1px solid #E4E4E7',
        borderRadius: '8px',
        color: '#18181B',
        fontSize: '11px',
      };
  const tooltipItemStyle = { color: isDark ? '#F4F4F5' : '#18181B' };
  const tooltipLabelStyle = { color: isDark ? '#A1A1AA' : '#52525B' };

  const inputClass =
    'w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/80 px-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-[#6D132B] dark:focus:border-rose-400 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none';

  return (
    <div className="space-y-6">
      {/* Main Interactive Prediction Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Employee Input Form */}
        <form
          onSubmit={handleSubmit}
          className="xl:col-span-6 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 space-y-4 transition-colors"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 dark:border-zinc-800 pb-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Employee Attrition Risk Simulator
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Enter employee profile attributes to score attrition risk using the trained model
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => loadPreset('high')}
                className="px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap transition-colors"
              >
                Sample High-Risk
              </button>
              <button
                type="button"
                onClick={() => loadPreset('low')}
                className="px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 whitespace-nowrap transition-colors"
              >
                Sample Low-Risk
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="pred-dept" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Department
              </label>
              <select
                id="pred-dept"
                value={form.Department}
                onChange={(e) => updateField('Department', e.target.value)}
                className={inputClass}
              >
                {options.departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pred-role" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Job Role
              </label>
              <select
                id="pred-role"
                value={form.Job_Role}
                onChange={(e) => updateField('Job_Role', e.target.value)}
                className={inputClass}
              >
                {rolesForDept.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pred-type" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Employment Type
              </label>
              <select
                id="pred-type"
                value={form.Employment_Type}
                onChange={(e) => updateField('Employment_Type', e.target.value)}
                className={inputClass}
              >
                {options.employmentTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pred-mgr" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Manager
              </label>
              <select
                id="pred-mgr"
                value={form.Manager}
                onChange={(e) => updateField('Manager', e.target.value)}
                className={inputClass}
              >
                {managersForDept.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pred-salary" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Monthly Salary (NGN)
              </label>
              <input
                id="pred-salary"
                type="number"
                min={50000}
                max={20000000}
                step={5000}
                value={form.Salary_NGN}
                onChange={(e) => updateField('Salary_NGN', Number(e.target.value))}
                className={`${inputClass} font-mono tabular-nums`}
              />
            </div>

            <div>
              <label htmlFor="pred-hire" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Hire Date
              </label>
              <input
                id="pred-hire"
                type="date"
                value={form.Hire_Date}
                onChange={(e) => updateField('Hire_Date', e.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </div>

            <div>
              <label htmlFor="pred-train" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Training Hours (Annual)
              </label>
              <input
                id="pred-train"
                type="number"
                min={0}
                max={500}
                value={form.Training_Hours}
                onChange={(e) => updateField('Training_Hours', Number(e.target.value))}
                className={`${inputClass} font-mono tabular-nums`}
              />
            </div>

            <div>
              <label htmlFor="pred-abs" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Absence Days (Annual)
              </label>
              <input
                id="pred-abs"
                type="number"
                min={0}
                max={365}
                value={form.Absence_Days}
                onChange={(e) => updateField('Absence_Days', Number(e.target.value))}
                className={`${inputClass} font-mono tabular-nums`}
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Job Satisfaction Score (1–5)
              </span>
              <div className="grid grid-cols-5 gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => updateField('Job_Satisfaction_Score', n)}
                    className={`h-7 rounded-md text-xs font-mono font-semibold transition-colors ${
                      form.Job_Satisfaction_Score === n
                        ? 'bg-[#6D132B] text-white shadow-sm'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-white/80 dark:hover:bg-zinc-700/80'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Performance Rating (1–5)
              </span>
              <div className="grid grid-cols-5 gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => updateField('Performance_Rating', n)}
                    className={`h-7 rounded-md text-xs font-mono font-semibold transition-colors ${
                      form.Performance_Rating === n
                        ? 'bg-[#6D132B] text-white shadow-sm'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-white/80 dark:hover:bg-zinc-700/80'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Overtime</span>
              <div className="grid grid-cols-2 gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                {(['No', 'Yes'] as const).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => updateField('Overtime', val)}
                    className={`h-7 rounded-md text-xs font-semibold transition-colors ${
                      form.Overtime === val
                        ? 'bg-[#6D132B] text-white shadow-sm'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-white/80 dark:hover:bg-zinc-700/80'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            {/* Demographic context fields (explicitly excluded from scoring) */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="pred-age" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Age
                </label>
                <input
                  id="pred-age"
                  type="number"
                  min={18}
                  max={75}
                  value={form.Age}
                  onChange={(e) => updateField('Age', Number(e.target.value))}
                  className={`${inputClass} font-mono tabular-nums`}
                />
              </div>
              <div>
                <label htmlFor="pred-gender" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Gender
                </label>
                <select
                  id="pred-gender"
                  value={form.Gender}
                  onChange={(e) => updateField('Gender', e.target.value)}
                  className={inputClass}
                >
                  {options.genders.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/80 px-3 py-2 flex items-start gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
            <ShieldCheck className="h-4 w-4 text-[#6D132B] dark:text-rose-400 shrink-0 mt-0.5" />
            <span>
              <strong className="text-zinc-800 dark:text-zinc-100">Fairness Safeguard:</strong> Age and Gender are collected for workforce context only and are excluded from model inputs so demographic attributes never influence individual risk scores.
            </span>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-lg bg-[#6D132B] hover:bg-[#520B1F] text-white text-sm font-semibold shadow-sm transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Evaluating Risk...
              </>
            ) : (
              'Predict Attrition Risk'
            )}
          </button>
        </form>

        {/* Right: Prediction Result & Retention Plan */}
        <div className="xl:col-span-6 space-y-5">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Predicted Attrition Assessment
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Model: <strong className="text-zinc-800 dark:text-zinc-200">{prediction?.modelName ?? activeEval.modelName}</strong>
                </p>
              </div>
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Decision-Support Estimate
              </span>
            </div>

            {prediction?.adequacyWarning && (
              <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                {prediction.adequacyWarning}
              </div>
            )}

            {prediction ? (
              <div className="space-y-5">
                <div className="py-2 border-b border-zinc-200/80 dark:border-zinc-800">
                  <RiskGauge
                    probabilityPct={prediction.probabilityPct}
                    classification={prediction.riskClassification}
                    isDark={isDark}
                  />
                </div>

                {/* Key Factors Influencing This Prediction */}
                <div>
                  <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2.5">
                    Key Factors Influencing This Estimate
                  </h3>
                  {prediction.keyFactors.length === 0 ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Profile aligns closely with baseline workforce averages across measured factors.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {prediction.keyFactors.map((f) => {
                        const widthPct = Math.min(100, Math.max(8, Math.abs(f.impact) * 3.5));
                        const increases = f.direction === 'increases_risk';
                        return (
                          <div key={f.factor} className="text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <div>
                                <span className="font-medium text-zinc-900 dark:text-zinc-100">{f.factor}</span>
                                <span className="text-zinc-500 dark:text-zinc-400 ml-1.5">· {f.detail}</span>
                              </div>
                              <span
                                className={`font-mono font-semibold tabular-nums ${
                                  increases
                                    ? 'text-[#6D132B] dark:text-rose-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                                }`}
                              >
                                {increases ? '+' : ''}
                                {f.impact} pts
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  increases ? 'bg-[#6D132B] dark:bg-rose-500' : 'bg-emerald-600 dark:bg-emerald-500'
                                }`}
                                style={{ width: `${widthPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Practical Retention Recommendations */}
                <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800">
                  <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#6D132B] dark:text-rose-400" />
                    Suggested Retention Actions
                  </h3>
                  <ul className="space-y-2">
                    {prediction.recommendations.map((rec, i) => (
                      <li key={i} className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed flex gap-2">
                        <span className="font-mono text-[#6D132B] dark:text-rose-400 font-semibold">0{i + 1}.</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  {prediction.fairnessNote}
                </p>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-zinc-500 dark:text-zinc-400">
                Computing baseline prediction...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Model Comparison, Confusion Matrix, ROC & Fairness Audit */}
      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 space-y-5 transition-colors">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Model Benchmark Comparison &amp; Validation
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Stratified 80/20 split ({trainingSummary.trainSamples} train / {trainingSummary.testSamples} test) + 5-fold cross-validation · Leakage fields excluded: {trainingSummary.excludedLeakageFields.join(', ')}
            </p>
          </div>
          {switchingModel && (
            <span className="text-xs text-[#6D132B] dark:text-rose-400 font-medium">Switching active model...</span>
          )}
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto border border-zinc-200/80 dark:border-zinc-800 rounded-xl">
          <table className="w-full text-left border-collapse text-xs tabular-nums">
            <thead>
              <tr className="bg-zinc-50/90 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">
                <th className="py-2.5 px-3 font-semibold">Model</th>
                <th className="py-2.5 px-3 font-semibold text-right">Accuracy</th>
                <th className="py-2.5 px-3 font-semibold text-right">Precision</th>
                <th className="py-2.5 px-3 font-semibold text-right">Recall</th>
                <th className="py-2.5 px-3 font-semibold text-right">F1-Score</th>
                <th className="py-2.5 px-3 font-semibold text-right">Test ROC-AUC</th>
                <th className="py-2.5 px-3 font-semibold text-right">5-Fold CV AUC</th>
                <th className="py-2.5 px-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
              {trainingSummary.models.map((m) => {
                const isActive = m.modelId === trainingSummary.activeModelId;
                return (
                  <tr key={m.modelId} className={isActive ? 'bg-rose-50/35 dark:bg-rose-950/25' : ''}>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">{m.modelName}</div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{m.description}</div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono">{(m.testAccuracy * 100).toFixed(1)}%</td>
                    <td className="py-3 px-3 text-right font-mono">{(m.testPrecision * 100).toFixed(1)}%</td>
                    <td className="py-3 px-3 text-right font-mono">{(m.testRecall * 100).toFixed(1)}%</td>
                    <td className="py-3 px-3 text-right font-mono">{m.testF1.toFixed(3)}</td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-[#6D132B] dark:text-rose-400">
                      {m.testRocAuc.toFixed(3)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {m.cvRocAucMean.toFixed(3)} ± {m.cvRocAucStd.toFixed(3)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        disabled={isActive || switchingModel}
                        onClick={() => handleModelSwitch(m.modelId)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                          isActive
                            ? 'bg-[#6D132B] text-white cursor-default'
                            : 'border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {isActive ? 'Active Model' : 'Use Model'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Confusion Matrix + ROC Curve + Global Importance */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-2">
          {/* Confusion Matrix */}
          <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-4">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              Test Confusion Matrix ({activeEval.modelName})
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3">
              Evaluated on {trainingSummary.testSamples} held-out records (threshold {activeEval.threshold})
            </p>
            <div className="grid grid-cols-2 gap-2 text-center tabular-nums">
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-700/70 p-3">
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">True Negative (TN)</div>
                <div className="mt-1 font-mono text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {activeEval.confusionMatrix.tn}
                </div>
                <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">Correctly Retained</div>
              </div>
              <div className="rounded-lg bg-amber-50/60 dark:bg-amber-950/35 border border-amber-200/70 dark:border-amber-800/50 p-3">
                <div className="text-[11px] text-amber-800 dark:text-amber-300">False Positive (FP)</div>
                <div className="mt-1 font-mono text-lg font-bold text-amber-900 dark:text-amber-200">
                  {activeEval.confusionMatrix.fp}
                </div>
                <div className="text-[10.5px] text-amber-700 dark:text-amber-400">Flagged, Stayed</div>
              </div>
              <div className="rounded-lg bg-rose-50/60 dark:bg-rose-950/35 border border-rose-200/70 dark:border-rose-800/50 p-3">
                <div className="text-[11px] text-rose-800 dark:text-rose-300">False Negative (FN)</div>
                <div className="mt-1 font-mono text-lg font-bold text-[#6D132B] dark:text-rose-400">
                  {activeEval.confusionMatrix.fn}
                </div>
                <div className="text-[10.5px] text-rose-700 dark:text-rose-400">Missed Exit</div>
              </div>
              <div className="rounded-lg bg-emerald-50/60 dark:bg-emerald-950/35 border border-emerald-200/70 dark:border-emerald-800/50 p-3">
                <div className="text-[11px] text-emerald-800 dark:text-emerald-300">True Positive (TP)</div>
                <div className="mt-1 font-mono text-lg font-bold text-emerald-900 dark:text-emerald-200">
                  {activeEval.confusionMatrix.tp}
                </div>
                <div className="text-[10.5px] text-emerald-700 dark:text-emerald-400">Correctly Flagged</div>
              </div>
            </div>
          </div>

          {/* ROC Curve */}
          <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-4">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              ROC Curve (AUC = {activeEval.testRocAuc.toFixed(3)})
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2">
              True Positive Rate vs. False Positive Rate across classification thresholds
            </p>
            <div className="h-[195px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activeEval.rocCurve} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis dataKey="fpr" type="number" domain={[0, 1]} tick={{ fontSize: 10, fill: chartTick }} />
                  <YAxis dataKey="tpr" type="number" domain={[0, 1]} tick={{ fontSize: 10, fill: chartTick }} />
                  <Tooltip
                    formatter={(val: unknown) => [Number(val).toFixed(2), '']}
                    contentStyle={tooltipStyle}
                    itemStyle={tooltipItemStyle}
                    labelStyle={tooltipLabelStyle}
                  />
                  <Line type="monotone" dataKey="tpr" name="TPR" stroke={accentPrimary} strokeWidth={2.2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Global Feature Importance */}
          <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-4">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              Global Feature Importance
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2">
              Relative feature contribution weight in {activeEval.modelName}
            </p>
            <div className="h-[195px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeEval.featureImportances.slice(0, 8)}
                  layout="vertical"
                  margin={{ top: 2, right: 14, left: 4, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                  <XAxis type="number" unit="%" tick={{ fontSize: 10, fill: chartTick }} axisLine={false} tickLine={false} />
                  <YAxis
                    dataKey="label"
                    type="category"
                    width={108}
                    tick={{ fontSize: 10.5, fill: chartLabelTick }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v: unknown) => [`${v}%`, 'Weight']}
                    contentStyle={tooltipStyle}
                    itemStyle={tooltipItemStyle}
                    labelStyle={tooltipLabelStyle}
                  />
                  <Bar dataKey="importance" radius={[0, 3, 3, 0]} barSize={12}>
                    {activeEval.featureImportances.slice(0, 8).map((item, idx) => (
                      <Cell key={item.feature} fill={idx < 3 ? accentPrimary : accentSecondary} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Demographic Fairness Audit */}
        <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/35 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-[#6D132B] dark:text-rose-400" />
              <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Demographic Fairness &amp; Parity Audit (Held-Out Test Set)
              </h3>
            </div>
            <div className="text-[11px] text-zinc-600 dark:text-zinc-300 tabular-nums">
              Gender Parity Gap: <strong className="font-mono text-zinc-900 dark:text-zinc-100">{trainingSummary.fairnessAudit.genderMaxParityGap} pts</strong>
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
              Age Parity Gap: <strong className="font-mono text-zinc-900 dark:text-zinc-100">{trainingSummary.fairnessAudit.ageMaxParityGap} pts</strong>
            </div>
          </div>

          <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
            {trainingSummary.fairnessAudit.summaryNote}
          </p>

          <div className="overflow-x-auto bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg">
            <table className="w-full text-left border-collapse text-xs tabular-nums">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 bg-zinc-50/70 dark:bg-zinc-800/70">
                  <th className="py-2 px-3 font-semibold">Attribute</th>
                  <th className="py-2 px-3 font-semibold">Subgroup</th>
                  <th className="py-2 px-3 font-semibold text-right">Test n</th>
                  <th className="py-2 px-3 font-semibold text-right">Actual Exit %</th>
                  <th className="py-2 px-3 font-semibold text-right">Flagged Rate %</th>
                  <th className="py-2 px-3 font-semibold text-right">True Positive Rate</th>
                  <th className="py-2 px-3 font-semibold text-right">False Positive Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                {trainingSummary.fairnessAudit.groups.map((g) => (
                  <tr key={`${g.groupType}-${g.groupName}`}>
                    <td className="py-2 px-3 text-zinc-500 dark:text-zinc-400">{g.groupType}</td>
                    <td className="py-2 px-3 font-medium text-zinc-900 dark:text-zinc-100">{g.groupName}</td>
                    <td className="py-2 px-3 text-right font-mono">{g.sampleCount}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {g.suppressed ? 'Suppressed' : `${g.actualAttritionRate}%`}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-[#6D132B] dark:text-rose-400">
                      {g.suppressed ? 'Suppressed' : `${g.predictedPositiveRate}%`}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {g.suppressed || g.truePositiveRate === null ? '—' : `${g.truePositiveRate}%`}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {g.suppressed || g.falsePositiveRate === null ? '—' : `${g.falsePositiveRate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
