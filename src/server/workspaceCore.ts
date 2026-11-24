import crypto from 'crypto';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import Papa from 'papaparse';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseAndCleanDataset } from '../shared/dataCleaner.ts';
import {
  explainAndPredict,
  scoreAllEmployees,
  trainAndEvaluateModels,
  type TrainedArtifacts,
} from '../ml/mlEngine.ts';
import type {
  CleanEmployee,
  ColumnMapping,
  ConnectorStatus,
  DataQualityReport,
  DataSourceType,
  ModelId,
  PredictionInput,
  ScoredEmployee,
  WorkspacePayload,
} from '../shared/types.ts';
import {
  ConnectorValidationError,
  DEFAULT_GOOGLE_SHEET_URL,
  fetchGoogleSheetDataset,
} from './googleSheetConnector.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WorkspaceState {
  employees: CleanEmployee[];
  scoredEmployees: ScoredEmployee[];
  qualityReport: DataQualityReport;
  artifacts: TrainedArtifacts;
  activeModelId: ModelId;
  isCustomDataset: boolean;
  datasetHash: string;
  csvText: string;
  mapping?: Partial<ColumnMapping>;
  connectorStatus: ConnectorStatus;
}

export interface ApiActionResult {
  status: number;
  body: unknown;
}

export class HttpRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let cachedDefaultCsv: string | null = null;
let state: WorkspaceState | null = null;
let initPromise: Promise<WorkspaceState> | null = null;

function resolveDatasetPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data', 'employee_attrition.csv'),
    path.resolve(__dirname, '..', '..', 'data', 'employee_attrition.csv'),
    path.resolve(__dirname, '..', 'data', 'employee_attrition.csv'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Default dataset file "data/employee_attrition.csv" could not be located. Checked: ${candidates.join(', ')}`
  );
}

function getDefaultCsvText(): string {
  if (!cachedDefaultCsv) {
    const filePath = resolveDatasetPath();
    cachedDefaultCsv = fs.readFileSync(filePath, 'utf8');
  }
  return cachedDefaultCsv;
}

export function computeDatasetHash(
  csvText: string,
  mapping?: Partial<ColumnMapping>,
  isCustomDataset = false
): string {
  if (!isCustomDataset) {
    return 'default-dataset';
  }
  const normalizedMapping = mapping
    ? Object.keys(mapping)
        .sort()
        .reduce<Record<string, string | null>>((acc, key) => {
          acc[key] = mapping[key as keyof ColumnMapping] ?? null;
          return acc;
        }, {})
    : {};
  return crypto
    .createHash('sha256')
    .update(csvText)
    .update('\n')
    .update(JSON.stringify(normalizedMapping))
    .digest('hex')
    .slice(0, 16);
}

export function buildWorkspaceState(
  csvText: string,
  source: DataSourceType,
  mapping?: Partial<ColumnMapping>,
  connectorMeta?: Partial<ConnectorStatus>
): WorkspaceState {
  const isCustomDataset = source !== 'default_csv';
  const { employees, qualityReport } = parseAndCleanDataset(csvText, mapping);
  const artifacts = trainAndEvaluateModels(employees, qualityReport.snapshotDate);
  const activeModelId = artifacts.summary.activeModelId;
  const scoredEmployees = scoreAllEmployees(employees, artifacts, activeModelId);
  const datasetHash = computeDatasetHash(csvText, mapping, isCustomDataset);

  return {
    employees,
    scoredEmployees,
    qualityReport,
    artifacts,
    activeModelId,
    isCustomDataset,
    datasetHash,
    csvText,
    mapping,
    connectorStatus: {
      source,
      googleSheetUrl: connectorMeta?.googleSheetUrl ?? DEFAULT_GOOGLE_SHEET_URL,
      lastSyncedAt: connectorMeta?.lastSyncedAt ?? null,
      lastError: connectorMeta?.lastError ?? null,
    },
  };
}

export function getOrInitState(): WorkspaceState {
  if (!state) {
    const csvText = getDefaultCsvText();
    state = buildWorkspaceState(csvText, 'default_csv');
  }
  return state;
}

async function applyGoogleSheetUpdate(targetUrl: string): Promise<WorkspaceState> {
  const fetched = await fetchGoogleSheetDataset(targetUrl);
  const incomingHash = computeDatasetHash(fetched.csvText, fetched.mapping, true);
  const syncedAt = new Date().toISOString();

  if (
    state &&
    state.connectorStatus.source === 'google_sheet' &&
    state.datasetHash === incomingHash
  ) {
    state.connectorStatus = {
      ...state.connectorStatus,
      source: 'google_sheet',
      googleSheetUrl: fetched.url,
      lastSyncedAt: syncedAt,
      lastError: null,
    };
    return state;
  }

  const prevActiveModelId = state?.activeModelId;
  const nextState = buildWorkspaceState(
    fetched.csvText,
    'google_sheet',
    fetched.mapping,
    {
      googleSheetUrl: fetched.url,
      lastSyncedAt: syncedAt,
      lastError: null,
    }
  );

  if (
    prevActiveModelId &&
    nextState.activeModelId !== prevActiveModelId &&
    nextState.artifacts.summary.models.some((m) => m.modelId === prevActiveModelId)
  ) {
    nextState.activeModelId = prevActiveModelId;
    nextState.scoredEmployees = scoreAllEmployees(
      nextState.employees,
      nextState.artifacts,
      prevActiveModelId
    );
  }

  state = nextState;
  return state;
}

export async function getOrInitStateWithConnector(): Promise<WorkspaceState> {
  const shouldFetchConnector =
    !state ||
    state.connectorStatus.source === 'google_sheet' ||
    (state.connectorStatus.source === 'default_csv' &&
      state.connectorStatus.lastError !== null);

  if (!shouldFetchConnector && state) {
    return state;
  }

  const targetUrl = state?.connectorStatus.googleSheetUrl ?? DEFAULT_GOOGLE_SHEET_URL;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        return await applyGoogleSheetUpdate(targetUrl);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to reach Google Sheet connector.';
        if (!state) {
          const csvText = getDefaultCsvText();
          state = buildWorkspaceState(csvText, 'default_csv', undefined, {
            googleSheetUrl: targetUrl,
            lastSyncedAt: null,
            lastError: message,
          });
        } else {
          state.connectorStatus = {
            ...state.connectorStatus,
            googleSheetUrl: targetUrl,
            lastError: message,
          };
        }
        return state!;
      } finally {
        initPromise = null;
      }
    })();
  }
  return initPromise;
}

function buildOptions(employees: CleanEmployee[]): WorkspacePayload['options'] {
  const departments = Array.from(new Set(employees.map((e) => e.Department))).sort();
  const jobRoles = Array.from(new Set(employees.map((e) => e.Job_Role))).sort();
  const employmentTypes = Array.from(new Set(employees.map((e) => e.Employment_Type))).sort();
  const genders = Array.from(new Set(employees.map((e) => e.Gender))).sort();
  const managers = Array.from(new Set(employees.map((e) => e.Manager))).sort();

  const rolesByDepartment: Record<string, string[]> = {};
  const managersByDepartment: Record<string, string[]> = {};
  for (const d of departments) {
    const deptRows = employees.filter((e) => e.Department === d);
    rolesByDepartment[d] = Array.from(new Set(deptRows.map((e) => e.Job_Role))).sort();
    managersByDepartment[d] = Array.from(new Set(deptRows.map((e) => e.Manager))).sort();
  }

  return {
    departments,
    jobRoles,
    rolesByDepartment,
    employmentTypes,
    genders,
    managers,
    managersByDepartment,
  };
}

export function toPayload(ws: WorkspaceState): WorkspacePayload {
  return {
    employees: ws.scoredEmployees,
    qualityReport: ws.qualityReport,
    trainingSummary: {
      ...ws.artifacts.summary,
      activeModelId: ws.activeModelId,
    },
    options: buildOptions(ws.employees),
    isCustomDataset: ws.isCustomDataset,
    datasetHash: ws.datasetHash,
    connectorStatus: ws.connectorStatus,
    ...(ws.isCustomDataset
      ? {
          activeCsvText: ws.csvText,
          activeMapping: ws.mapping,
        }
      : {}),
  };
}

export function isValidModelId(val: unknown): val is ModelId {
  return val === 'logistic_regression' || val === 'random_forest' || val === 'gradient_boosting';
}

export function sanitizeMapping(rawMapping: unknown): Partial<ColumnMapping> | undefined {
  if (!rawMapping || typeof rawMapping !== 'object' || Array.isArray(rawMapping)) {
    return undefined;
  }
  const sanitized: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(rawMapping as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim().length > 0) {
      sanitized[k] = v;
    } else if (v === null) {
      sanitized[k] = null;
    }
  }
  return sanitized as Partial<ColumnMapping>;
}

export function validatePredictionInput(
  body: unknown
): { ok: true; data: PredictionInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request payload must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;
  const age = Number(b.Age);
  const salary = Number(b.Salary_NGN);
  const perf = Number(b.Performance_Rating);
  const trainHrs = Number(b.Training_Hours);
  const absDays = Number(b.Absence_Days);
  const sat = Number(b.Job_Satisfaction_Score);

  const dept = String(b.Department ?? '').trim();
  const role = String(b.Job_Role ?? '').trim();
  const empType = String(b.Employment_Type ?? '').trim();
  const gender = String(b.Gender ?? '').trim();
  const manager = String(b.Manager ?? '').trim();
  const hireDate = String(b.Hire_Date ?? '').trim();
  const overtime = b.Overtime === 'Yes' ? 'Yes' : b.Overtime === 'No' ? 'No' : null;

  if (!Number.isFinite(age) || age < 16 || age > 85) {
    return { ok: false, error: 'Age must be between 16 and 85.' };
  }
  if (!Number.isFinite(salary) || salary <= 0 || salary > 100_000_000) {
    return { ok: false, error: 'Salary (NGN) must be a positive number.' };
  }
  if (!Number.isFinite(perf) || perf < 1 || perf > 5) {
    return { ok: false, error: 'Performance Rating must be between 1 and 5.' };
  }
  if (!Number.isFinite(sat) || sat < 1 || sat > 5) {
    return { ok: false, error: 'Job Satisfaction Score must be between 1 and 5.' };
  }
  if (!Number.isFinite(trainHrs) || trainHrs < 0 || trainHrs > 2000) {
    return { ok: false, error: 'Training Hours must be between 0 and 2000.' };
  }
  if (!Number.isFinite(absDays) || absDays < 0 || absDays > 365) {
    return { ok: false, error: 'Absence Days must be between 0 and 365.' };
  }
  if (!overtime) {
    return { ok: false, error: 'Overtime must be "Yes" or "No".' };
  }
  if (!dept || !role || !empType || !gender || !manager) {
    return {
      ok: false,
      error: 'Department, Job Role, Employment Type, Gender, and Manager are required.',
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) {
    return { ok: false, error: 'Hire Date must be a valid YYYY-MM-DD date.' };
  }

  return {
    ok: true,
    data: {
      Age: Math.round(age),
      Gender: gender,
      Department: dept,
      Job_Role: role,
      Employment_Type: empType,
      Salary_NGN: Math.round(salary),
      Performance_Rating: Math.round(perf),
      Training_Hours: Math.round(trainHrs),
      Absence_Days: Math.round(absDays),
      Job_Satisfaction_Score: Math.round(sat),
      Overtime: overtime,
      Manager: manager,
      Hire_Date: hireDate,
    },
  };
}

function ensureDatasetContext(body: Record<string, unknown> | undefined): {
  ok: true;
  ws: WorkspaceState;
} | {
  ok: false;
  result: ApiActionResult;
} {
  let ws = getOrInitState();
  const expectedHash = typeof body?.datasetHash === 'string' ? body.datasetHash : undefined;
  const customDataset =
    body?.customDataset && typeof body.customDataset === 'object'
      ? (body.customDataset as Record<string, unknown>)
      : null;

  if (
    customDataset &&
    typeof customDataset.csvText === 'string' &&
    customDataset.csvText.trim().length >= 20
  ) {
    const mapping = sanitizeMapping(customDataset.mapping);
    const incomingHash = computeDatasetHash(customDataset.csvText, mapping, true);
    if (ws.datasetHash !== incomingHash) {
      const source: DataSourceType =
        customDataset.source === 'google_sheet' ? 'google_sheet' : 'uploaded_csv';
      const googleSheetUrl =
        typeof customDataset.googleSheetUrl === 'string'
          ? customDataset.googleSheetUrl
          : DEFAULT_GOOGLE_SHEET_URL;
      state = buildWorkspaceState(customDataset.csvText, source, mapping, {
        googleSheetUrl,
        lastSyncedAt: source === 'google_sheet' ? new Date().toISOString() : ws.connectorStatus.lastSyncedAt,
        lastError: source === 'google_sheet' ? null : ws.connectorStatus.lastError,
      });
      ws = state;
    }
    return { ok: true, ws };
  }

  if (expectedHash && expectedHash !== 'default-dataset' && ws.datasetHash !== expectedHash) {
    return {
      ok: false,
      result: {
        status: 409,
        body: {
          error: 'Dataset session expired on stateless worker.',
          code: 'DATASET_REHYDRATE_REQUIRED',
        },
      },
    };
  }

  return { ok: true, ws };
}

function serializeEmployeesToCsv(employees: CleanEmployee[]): string {
  const rows = employees.map((e) => ({
    Employee_ID: e.Employee_ID,
    Age: e.Age,
    Gender: e.Gender,
    Department: e.Department,
    Job_Role: e.Job_Role,
    Employment_Type: e.Employment_Type,
    Hire_Date: e.Hire_Date,
    Salary_NGN: e.Salary_NGN,
    Performance_Rating: e.Performance_Rating,
    Training_Hours: e.Training_Hours,
    Absence_Days: e.Absence_Days,
    Job_Satisfaction_Score: e.Job_Satisfaction_Score,
    Overtime: e.Overtime,
    Manager: e.Manager,
    Employment_Status: e.Employment_Status,
    Exit_Date: e.Exit_Date ?? '',
    Attrition_Status: e.Attrition_Status,
  }));
  return Papa.unparse(rows);
}

export async function handleGetWorkspace(): Promise<ApiActionResult> {
  try {
    const ws = await getOrInitStateWithConnector();
    return { status: 200, body: toPayload(ws) };
  } catch (err) {
    return {
      status: 500,
      body: { error: err instanceof Error ? err.message : 'Failed to load workspace.' },
    };
  }
}

export function handlePostPredict(body: unknown): ApiActionResult {
  try {
    const reqObj =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const context = ensureDatasetContext(reqObj);
    if (!context.ok) {
      return context.result;
    }
    const ws = context.ws;
    const validation = validatePredictionInput(reqObj.input ?? reqObj);
    if (!validation.ok) {
      return { status: 400, body: { error: validation.error } };
    }
    const requestedModel = reqObj.modelId;
    const modelId: ModelId = isValidModelId(requestedModel) ? requestedModel : ws.activeModelId;
    const result = explainAndPredict(ws.artifacts, modelId, validation.data);
    return { status: 200, body: result };
  } catch (err) {
    return {
      status: 500,
      body: { error: err instanceof Error ? err.message : 'Prediction failed.' },
    };
  }
}

export function handlePostSelectModel(body: unknown): ApiActionResult {
  try {
    const reqObj =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const context = ensureDatasetContext(reqObj);
    if (!context.ok) {
      return context.result;
    }
    const ws = context.ws;
    const modelId = reqObj.modelId;
    if (!isValidModelId(modelId)) {
      return { status: 400, body: { error: 'Invalid modelId.' } };
    }
    ws.activeModelId = modelId;
    ws.scoredEmployees = scoreAllEmployees(ws.employees, ws.artifacts, modelId);
    return { status: 200, body: toPayload(ws) };
  } catch (err) {
    return {
      status: 500,
      body: { error: err instanceof Error ? err.message : 'Model switch failed.' },
    };
  }
}

export function handlePostUpload(body: unknown): ApiActionResult {
  try {
    const reqObj =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const csvText = reqObj.csvText;
    if (typeof csvText !== 'string' || csvText.trim().length < 20) {
      return { status: 400, body: { error: 'Uploaded CSV content is empty or invalid.' } };
    }
    const mapping = sanitizeMapping(reqObj.mapping);
    const mode = reqObj.mode === 'merge' ? 'merge' : 'replace';

    if (mode === 'merge') {
      const context = ensureDatasetContext(reqObj);
      if (!context.ok) {
        return context.result;
      }
      const existing = context.ws;
      const incoming = parseAndCleanDataset(csvText, mapping);
      const mergedMap = new Map<string, CleanEmployee>();
      for (const emp of existing.employees) {
        mergedMap.set(emp.Employee_ID.toUpperCase(), emp);
      }
      for (const emp of incoming.employees) {
        mergedMap.set(emp.Employee_ID.toUpperCase(), emp);
      }
      const mergedCsv = serializeEmployeesToCsv(Array.from(mergedMap.values()));
      state = buildWorkspaceState(mergedCsv, 'uploaded_csv', undefined, {
        googleSheetUrl: existing.connectorStatus.googleSheetUrl,
        lastSyncedAt: existing.connectorStatus.lastSyncedAt,
        lastError: existing.connectorStatus.lastError,
      });
      return { status: 200, body: toPayload(state) };
    }

    const prevConnector = state?.connectorStatus;
    state = buildWorkspaceState(csvText, 'uploaded_csv', mapping, {
      googleSheetUrl: prevConnector?.googleSheetUrl ?? DEFAULT_GOOGLE_SHEET_URL,
      lastSyncedAt: prevConnector?.lastSyncedAt ?? null,
      lastError: prevConnector?.lastError ?? null,
    });
    return { status: 200, body: toPayload(state) };
  } catch (err) {
    return {
      status: 400,
      body: { error: err instanceof Error ? err.message : 'Failed to process uploaded CSV.' },
    };
  }
}

export async function handlePostSyncGoogleSheet(body: unknown): Promise<ApiActionResult> {
  const reqObj =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const rawUrl =
    typeof reqObj.url === 'string' && reqObj.url.trim().length > 0
      ? reqObj.url.trim()
      : state?.connectorStatus.googleSheetUrl || DEFAULT_GOOGLE_SHEET_URL;

  try {
    const ws = await applyGoogleSheetUpdate(rawUrl);
    return {
      status: 200,
      body: {
        ...toPayload(ws),
        syncResult: {
          ok: true,
          message: `Synced ${ws.employees.length} records from Google Sheet.`,
        },
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to sync dataset from Google Sheet URL.';
    if (err instanceof ConnectorValidationError && err.status === 400) {
      return {
        status: 400,
        body: { error: message },
      };
    }

    const ws = state ?? getOrInitState();
    ws.connectorStatus = {
      ...ws.connectorStatus,
      googleSheetUrl: rawUrl,
      lastError: message,
    };
    return {
      status: 200,
      body: {
        ...toPayload(ws),
        syncResult: {
          ok: false,
          message,
        },
      },
    };
  }
}

export function handlePostResetDataset(): ApiActionResult {
  try {
    const csvText = getDefaultCsvText();
    const prevConnector = state?.connectorStatus;
    state = buildWorkspaceState(csvText, 'default_csv', undefined, {
      googleSheetUrl: prevConnector?.googleSheetUrl ?? DEFAULT_GOOGLE_SHEET_URL,
      lastSyncedAt: null,
      lastError: prevConnector?.lastError ?? null,
    });
    return { status: 200, body: toPayload(state) };
  } catch (err) {
    return {
      status: 500,
      body: { error: err instanceof Error ? err.message : 'Failed to reset dataset.' },
    };
  }
}

// ==========================================
// VERCEL / NODE SERVERLESS HTTP HELPERS
// ==========================================
export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function methodNotAllowed(res: ServerResponse, allowed: string[]): void {
  res.setHeader('Allow', allowed.join(', '));
  sendJson(res, 405, {
    error: `Method not allowed. Expected ${allowed.join(' or ')}.`,
  });
}

export async function readJsonBody(
  req: IncomingMessage & { body?: unknown }
): Promise<Record<string, unknown>> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      if (!req.body.trim()) return {};
      try {
        const parsed = JSON.parse(req.body);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new HttpRequestError(400, 'Request body must be a JSON object.');
        }
        return parsed as Record<string, unknown>;
      } catch (err) {
        if (err instanceof HttpRequestError) throw err;
        throw new HttpRequestError(400, 'Invalid JSON request body.');
      }
    }
    if (typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)) {
      return req.body as Record<string, unknown>;
    }
    if (req.body === null) return {};
    throw new HttpRequestError(400, 'Request body must be a JSON object.');
  }

  const MAX_BYTES = 10 * 1024 * 1024;
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    totalBytes += buf.length;
    if (totalBytes > MAX_BYTES) {
      throw new HttpRequestError(413, 'Request body exceeds 10MB limit.');
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpRequestError(400, 'Request body must be a JSON object.');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof HttpRequestError) throw err;
    throw new HttpRequestError(400, 'Invalid JSON request body.');
  }
}
