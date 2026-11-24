import React, { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import type {
  CanonicalField,
  ColumnMapping,
  DataQualityReport,
  ScoredEmployee,
  TrainingSummary,
} from '../shared/types.ts';
import {
  CANONICAL_FIELD_SPECS,
  REQUIRED_COLUMNS,
  suggestColumnMapping,
} from '../shared/dataCleaner.ts';
import {
  computeGroupBreakdown,
  computeKpis,
  generateAutomatedInsights,
} from '../utils/analytics.ts';

interface ReportsPageProps {
  filteredEmployees: ScoredEmployee[];
  allEmployees: ScoredEmployee[];
  qualityReport: DataQualityReport;
  trainingSummary: TrainingSummary;
  isCustomDataset: boolean;
  onUploadCsv: (csvText: string, mapping?: Partial<ColumnMapping>) => Promise<void>;
  onResetDataset: () => Promise<void>;
}

interface PendingCsvImport {
  fileName: string;
  csvText: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
  mapping: ColumnMapping;
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsvField(val: unknown): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  filteredEmployees,
  allEmployees,
  qualityReport,
  trainingSummary,
  isCustomDataset,
  onUploadCsv,
  onResetDataset,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingCsvImport | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const kpis = useMemo(() => computeKpis(filteredEmployees), [filteredEmployees]);
  const depts = useMemo(
    () => computeGroupBreakdown(filteredEmployees, 'Department'),
    [filteredEmployees]
  );
  const insights = useMemo(
    () => generateAutomatedInsights(filteredEmployees),
    [filteredEmployees]
  );

  const handleDownloadCsv = () => {
    const headers = [
      'Employee_ID',
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
      'Predicted_Attrition_Probability',
      'Risk_Classification',
    ];
    const lines = [headers.join(',')];
    for (const e of filteredEmployees) {
      lines.push(
        [
          e.Employee_ID,
          e.Department,
          e.Job_Role,
          e.Employment_Type,
          e.Hire_Date,
          e.Salary_NGN,
          e.Performance_Rating,
          e.Training_Hours,
          e.Absence_Days,
          e.Job_Satisfaction_Score,
          e.Overtime,
          e.Manager,
          e.Employment_Status,
          e.Exit_Date ?? '',
          e.Attrition_Status,
          (e.attritionProbability * 100).toFixed(1) + '%',
          e.riskClassification,
        ]
          .map(escapeCsvField)
          .join(',')
      );
    }
    downloadBlob(
      `employee_attrition_analytics_${qualityReport.snapshotDate}.csv`,
      lines.join('\n'),
      'text/csv;charset=utf-8;'
    );
  };

  const handleDownloadTemplate = () => {
    const sampleRows = [
      REQUIRED_COLUMNS.join(','),
      'EMP1001,31,Female,Engineering,Software Engineer,Full-time,2022-03-14,650000,4,36,4,4,No,A. Bello,Active,,No',
      'EMP1002,27,Male,Sales,Account Executive,Full-time,2023-07-01,340000,3,12,11,2,Yes,C. Okafor,Exited,2025-01-18,Yes',
    ].join('\n');
    downloadBlob('employee_attrition_template.csv', sampleRows, 'text/csv;charset=utf-8;');
  };

  const handleExportSummaryMarkdown = () => {
    const activeModel =
      trainingSummary.models.find((m) => m.modelId === trainingSummary.activeModelId) ??
      trainingSummary.models[0];

    const md = [
      `# Employee Attrition Analytics — Executive Summary`,
      `Snapshot Reference Date: ${qualityReport.snapshotDate}`,
      `Records Included (Filtered Scope): ${filteredEmployees.length} of ${allEmployees.length}`,
      ``,
      `## Key Workforce KPIs`,
      `- Total Employees: ${kpis.totalEmployees}`,
      `- Employees Who Left: ${kpis.exitedEmployees}`,
      `- Overall Attrition Rate: ${kpis.attritionRate}%`,
      `- Employee Retention Rate: ${kpis.retentionRate}%`,
      `- Average Job Satisfaction: ${kpis.avgSatisfaction} / 5.0`,
      `- Average Performance Rating: ${kpis.avgPerformance} / 5.0`,
      `- Average Monthly Salary (Stayed vs Left): ₦${kpis.avgSalaryStayed.toLocaleString()} vs ₦${kpis.avgSalaryLeft.toLocaleString()}`,
      ``,
      `## Department Attrition Breakdown`,
      ...depts.map(
        (d) => `- ${d.name}: ${d.attritionRate}% (${d.exits}/${d.total} exits)`
      ),
      ``,
      `## Automated Statistical Insights`,
      ...insights.map((ins) => `- **${ins.headline}** (${ins.metricValue}): ${ins.explanation}`),
      ``,
      `## Active Predictive Model Evaluation (${activeModel.modelName})`,
      `- Test Accuracy: ${(activeModel.testAccuracy * 100).toFixed(1)}%`,
      `- Test Precision: ${(activeModel.testPrecision * 100).toFixed(1)}%`,
      `- Test Recall: ${(activeModel.testRecall * 100).toFixed(1)}%`,
      `- Test F1-Score: ${activeModel.testF1.toFixed(3)}`,
      `- Test ROC-AUC: ${activeModel.testRocAuc.toFixed(3)}`,
      `- 5-Fold CV ROC-AUC: ${activeModel.cvRocAucMean.toFixed(3)} ± ${activeModel.cvRocAucStd.toFixed(3)}`,
      ``,
      `## Data Preparation Assumptions`,
      ...qualityReport.assumptions.map((a) => `- ${a}`),
    ].join('\n');

    downloadBlob(
      `attrition_executive_summary_${qualityReport.snapshotDate}.md`,
      md,
      'text/markdown;charset=utf-8;'
    );
  };

  const handleExportJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      snapshotDate: qualityReport.snapshotDate,
      filteredScopeCount: filteredEmployees.length,
      kpis,
      departmentBreakdown: depts,
      insights,
      qualityReport,
      modelEvaluation: trainingSummary,
    };
    downloadBlob(
      `attrition_audit_bundle_${qualityReport.snapshotDate}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    );
  };

  const inspectFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadStatus({
        type: 'error',
        message: 'Please select a valid .csv file.',
      });
      return;
    }
    setUploadStatus(null);
    try {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      });
      const headers = (parsed.meta.fields ?? []).map((h) => h.trim()).filter(Boolean);
      if (headers.length < 2 || parsed.data.length < 4) {
        setUploadStatus({
          type: 'error',
          message: 'CSV must contain a header row with at least 2 columns and at least 4 employee rows.',
        });
        return;
      }
      const mapping = suggestColumnMapping(headers);
      setPendingImport({
        fileName: file.name,
        csvText: text,
        headers,
        sampleRows: parsed.data.slice(0, 3),
        totalRows: parsed.data.length,
        mapping,
      });
    } catch (err) {
      setUploadStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to read CSV file headers.',
      });
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) return;
    if (!pendingImport.mapping.Attrition_Status) {
      setUploadStatus({
        type: 'error',
        message: 'Please map the required Attrition Target column before importing.',
      });
      return;
    }
    setUploading(true);
    setUploadStatus(null);
    try {
      await onUploadCsv(pendingImport.csvText, pendingImport.mapping);
      const importedName = pendingImport.fileName;
      const mappedCount = Object.values(pendingImport.mapping).filter(Boolean).length;
      setPendingImport(null);
      setUploadStatus({
        type: 'success',
        message: `Imported "${importedName}" (${mappedCount} mapped fields) — cleaned records, recalculated all analytics, and retrained all 3 ML models.`,
      });
    } catch (err) {
      setUploadStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to parse and train on uploaded CSV.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleMappingChange = (field: CanonicalField, sourceHeader: string) => {
    setPendingImport((prev) =>
      prev
        ? {
            ...prev,
            mapping: {
              ...prev.mapping,
              [field]: sourceHeader === '' ? null : sourceHeader,
            },
          }
        : null
    );
  };

  const handleReset = async () => {
    setUploading(true);
    setUploadStatus(null);
    setPendingImport(null);
    try {
      await onResetDataset();
      setUploadStatus({
        type: 'success',
        message: 'Restored original 500-employee dataset and retrained models.',
      });
    } catch (err) {
      setUploadStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to restore original dataset.',
      });
    } finally {
      setUploading(false);
    }
  };

  const matchedCount = pendingImport
    ? Object.values(pendingImport.mapping).filter(Boolean).length
    : 0;

  return (
    <div className="space-y-6">
      {/* Exports & Dataset Replacement */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Export Reports */}
        <section className="xl:col-span-5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 flex flex-col justify-between transition-colors">
          <div>
            <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Export Analytics &amp; Executive Reports
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Download the currently filtered cohort ({filteredEmployees.length} records) with out-of-fold risk scores or export executive summaries.
            </p>

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={handleDownloadCsv}
                disabled={filteredEmployees.length === 0}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-[#6D132B] text-white text-xs font-semibold hover:bg-[#520B1F] disabled:opacity-40 transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <Download className="h-3.5 w-3.5" />
                  Download Filtered Employee Analytics (CSV)
                </span>
                <span className="font-mono text-[11px] text-rose-100 tabular-nums">
                  {filteredEmployees.length} rows
                </span>
              </button>

              <button
                type="button"
                onClick={handleExportSummaryMarkdown}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-[#6D132B] dark:text-rose-400" />
                  Export Executive Summary Report (Markdown)
                </span>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">.md</span>
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <Download className="h-3.5 w-3.5 text-[#6D132B] dark:text-rose-400" />
                  Export Full KPI &amp; Model Audit Bundle (JSON)
                </span>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">.json</span>
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            Date span: {qualityReport.dateRange.minHireDate} to {qualityReport.snapshotDate}
          </div>
        </section>

        {/* Replacement CSV Upload + Column Mapper */}
        <section className="xl:col-span-7 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 transition-colors">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Upload Any Employee Attrition CSV
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Auto-maps matching HR columns, lets you remap custom headers or use defaults for missing fields, and retrains all 3 ML models
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-[#6D132B] dark:text-rose-400" />
                Sample Template
              </button>
              {isCustomDataset && (
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore Original
                </button>
              )}
            </div>
          </div>

          {!pendingImport ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) inspectFile(file);
              }}
              className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                dragging
                  ? 'border-[#6D132B] dark:border-rose-500 bg-rose-50/40 dark:bg-rose-950/30'
                  : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/40 hover:border-zinc-300 dark:hover:border-zinc-600'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) inspectFile(file);
                  e.target.value = '';
                }}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-2 py-2">
                  <Loader2 className="h-6 w-6 text-[#6D132B] dark:text-rose-400 animate-spin" />
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Cleaning records &amp; retraining ML models...
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-[#6D132B] dark:text-rose-400 mx-auto" />
                  <div className="mt-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Drop any HR attrition CSV file here, or{' '}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[#6D132B] dark:text-rose-400 underline hover:text-[#520B1F] dark:hover:text-rose-300"
                    >
                      browse your computer
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto">
                    Only an Attrition Target column (e.g. Attrition, Left, Exited, Yes/No, 1/0) is strictly required. Other fields auto-map from common HR exports (e.g. MonthlyIncome, JobRole, OverTime) or use safe defaults.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/50 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <FileSpreadsheet className="h-4 w-4 text-[#6D132B] dark:text-rose-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {pendingImport.fileName}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {pendingImport.totalRows} rows • {pendingImport.headers.length} CSV columns •{' '}
                      {matchedCount} of {CANONICAL_FIELD_SPECS.length} fields mapped
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPendingImport((prev) =>
                        prev
                          ? { ...prev, mapping: suggestColumnMapping(prev.headers) }
                          : null
                      )
                    }
                    disabled={uploading}
                    className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Auto-Detect
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingImport(null)}
                    disabled={uploading}
                    className="p-1.5 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    aria-label="Cancel CSV import"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-[340px] overflow-y-auto bg-white dark:bg-zinc-900">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 text-[11px] text-zinc-600 dark:text-zinc-300 z-10">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Dashboard Field</th>
                      <th className="py-2 px-3 font-semibold">CSV Source Column</th>
                      <th className="py-2 px-3 font-semibold">Preview / Default</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {CANONICAL_FIELD_SPECS.map((spec) => {
                      const mappedHeader = pendingImport.mapping[spec.field] ?? '';
                      const samples = mappedHeader
                        ? pendingImport.sampleRows
                            .map((r) => String(r[mappedHeader] ?? '').trim())
                            .filter(Boolean)
                            .slice(0, 2)
                        : [];

                      return (
                        <tr key={spec.field} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/60">
                          <td className="py-2 px-3 align-middle">
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">{spec.label}</div>
                            <div className="text-[10px]">
                              {spec.required ? (
                                <span className="font-semibold text-[#6D132B] dark:text-rose-400">Required</span>
                              ) : (
                                <span className="text-zinc-400 dark:text-zinc-500">Optional</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 align-middle">
                            <select
                              value={mappedHeader}
                              onChange={(e) => handleMappingChange(spec.field, e.target.value)}
                              disabled={uploading}
                              className={`w-full max-w-[230px] rounded-lg border px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#6D132B]/20 dark:focus:ring-rose-500/25 ${
                                spec.required && !mappedHeader
                                  ? 'border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200'
                                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100'
                              }`}
                            >
                              <option value="">
                                {spec.required
                                  ? '— Select target column —'
                                  : '— Use default / Not in CSV —'}
                              </option>
                              {pendingImport.headers.map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3 align-middle text-[11px] text-zinc-500 dark:text-zinc-400">
                            {mappedHeader ? (
                              samples.length > 0 ? (
                                <span className="font-mono text-zinc-700 dark:text-zinc-300">
                                  {samples.join(' · ')}
                                </span>
                              ) : (
                                <span className="text-zinc-400 dark:text-zinc-500 italic">Empty in first rows</span>
                              )
                            ) : (
                              <span>{spec.defaultNote}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/60 border-t border-zinc-200 dark:border-zinc-800">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Ratings above 5 (e.g. 1–10) are rescaled to 1–5; US/EU/ISO dates are normalized automatically.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingImport(null)}
                    disabled={uploading}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={uploading || !pendingImport.mapping.Attrition_Status}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#6D132B] text-white text-xs font-semibold hover:bg-[#520B1F] disabled:opacity-40 transition-colors"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Importing &amp; Training...
                      </>
                    ) : (
                      <>
                        Import &amp; Retrain Models
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {uploadStatus && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs flex items-start gap-2 ${
                uploadStatus.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
              }`}
            >
              {uploadStatus.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span>{uploadStatus.message}</span>
            </div>
          )}
        </section>
      </div>

      {/* Data Quality & Missing Values Audit */}
      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-5 space-y-5 transition-colors">
        <div>
          <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Dataset Quality, Cleaning Audit &amp; Preparation Assumptions
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Automated validation diagnostics executed upon dataset ingestion
          </p>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 tabular-nums">
          <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/50 p-3">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Raw Rows</div>
            <div className="mt-1 font-mono text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {qualityReport.rawRowCount}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/50 p-3">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Validated Rows</div>
            <div className="mt-1 font-mono text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {qualityReport.validRowCount}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/50 p-3">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Duplicates Removed</div>
            <div className="mt-1 font-mono text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {qualityReport.duplicatesRemoved}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/50 p-3">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Currency Normalized</div>
            <div className="mt-1 font-mono text-lg font-bold text-[#6D132B] dark:text-rose-400">
              {qualityReport.currencyEncodingFixed}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/50 p-3">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Status Mismatches</div>
            <div className="mt-1 font-mono text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {qualityReport.statusConsistencyMismatches}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/50 p-3">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Date Anomalies</div>
            <div className="mt-1 font-mono text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {qualityReport.exitDateAnomalies}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Missing Values Table */}
          <div className="xl:col-span-6">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              Missing Values by Column
            </h3>
            <div className="overflow-x-auto border border-zinc-200/80 dark:border-zinc-800 rounded-xl max-h-[340px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs tabular-nums">
                <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Column Name</th>
                    <th className="py-2 px-3 font-semibold text-right">Missing Count</th>
                    <th className="py-2 px-3 font-semibold text-right">Missing %</th>
                    <th className="py-2 px-3 font-semibold">Interpretation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {qualityReport.missingByColumn.map((col) => (
                    <tr key={col.column}>
                      <td className="py-2 px-3 font-mono text-zinc-900 dark:text-zinc-100">{col.column}</td>
                      <td className="py-2 px-3 text-right font-mono">{col.missingCount}</td>
                      <td className="py-2 px-3 text-right font-mono">{col.missingPct}%</td>
                      <td className="py-2 px-3 text-zinc-500 dark:text-zinc-400">
                        {col.column === 'Exit_Date'
                          ? 'Expected empty for Active staff'
                          : col.missingCount === 0
                          ? 'Complete'
                          : 'Imputed / Dropped if invalid'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Assumptions & Model Adequacy */}
          <div className="xl:col-span-6 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Cleaning Actions &amp; Explicit Modeling Assumptions
              </h3>
              <ul className="space-y-2 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 p-4">
                {qualityReport.validationWarnings.map((w, i) => (
                  <li key={`w-${i}`} className="text-xs text-[#6D132B] dark:text-rose-400 font-medium flex gap-2">
                    <span className="font-mono">•</span>
                    <span>{w}</span>
                  </li>
                ))}
                {qualityReport.assumptions.map((a, i) => (
                  <li key={`a-${i}`} className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed flex gap-2">
                    <span className="font-mono text-zinc-400 dark:text-zinc-500">0{i + 1}.</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Predictive Dataset Adequacy Check
                </h3>
                <span
                  className={`text-xs font-semibold ${
                    trainingSummary.adequacyStatus === 'adequate'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : trainingSummary.adequacyStatus === 'limited'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-[#6D132B] dark:text-rose-400'
                  }`}
                >
                  {trainingSummary.adequacyStatus === 'adequate'
                    ? 'Adequate Sample'
                    : trainingSummary.adequacyStatus === 'limited'
                    ? 'Limited Sample'
                    : 'Insufficient Sample'}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {trainingSummary.adequacyMessage}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
