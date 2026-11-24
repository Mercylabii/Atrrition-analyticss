import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { parseAndCleanDataset } from './src/shared/dataCleaner.ts';
import {
  explainAndPredict,
  scoreAllEmployees,
  trainAndEvaluateModels,
  type TrainedArtifacts,
} from './src/ml/mlEngine.ts';
import type {
  CleanEmployee,
  ColumnMapping,
  DataQualityReport,
  ModelId,
  PredictionInput,
  ScoredEmployee,
  WorkspacePayload,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DATASET_PATH = path.resolve(__dirname, 'data', 'employee_attrition.csv');

interface WorkspaceState {
  employees: CleanEmployee[];
  scoredEmployees: ScoredEmployee[];
  qualityReport: DataQualityReport;
  artifacts: TrainedArtifacts;
  activeModelId: ModelId;
  isCustomDataset: boolean;
}

let state: WorkspaceState | null = null;

function buildWorkspaceState(
  csvText: string,
  isCustomDataset: boolean,
  mapping?: Partial<ColumnMapping>
): WorkspaceState {
  const { employees, qualityReport } = parseAndCleanDataset(csvText, mapping);
  const artifacts = trainAndEvaluateModels(employees, qualityReport.snapshotDate);
  const activeModelId = artifacts.summary.activeModelId;
  const scoredEmployees = scoreAllEmployees(employees, artifacts, activeModelId);

  return {
    employees,
    scoredEmployees,
    qualityReport,
    artifacts,
    activeModelId,
    isCustomDataset,
  };
}

function getOrInitState(): WorkspaceState {
  if (!state) {
    const csvText = fs.readFileSync(DEFAULT_DATASET_PATH, 'utf8');
    state = buildWorkspaceState(csvText, false);
  }
  return state;
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

function toPayload(ws: WorkspaceState): WorkspacePayload {
  return {
    employees: ws.scoredEmployees,
    qualityReport: ws.qualityReport,
    trainingSummary: {
      ...ws.artifacts.summary,
      activeModelId: ws.activeModelId,
    },
    options: buildOptions(ws.employees),
    isCustomDataset: ws.isCustomDataset,
  };
}

function isValidModelId(val: unknown): val is ModelId {
  return val === 'logistic_regression' || val === 'random_forest' || val === 'gradient_boosting';
}

function validatePredictionInput(body: unknown): { ok: true; data: PredictionInput } | { ok: false; error: string } {
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
    return { ok: false, error: 'Department, Job Role, Employment Type, Gender, and Manager are required.' };
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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Initialize dataset and ML models eagerly on server boot
  getOrInitState();

  app.get('/api/workspace', (_req, res) => {
    try {
      const ws = getOrInitState();
      res.json(toPayload(ws));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load workspace.' });
    }
  });

  app.post('/api/predict', (req, res) => {
    try {
      const ws = getOrInitState();
      const validation = validatePredictionInput(req.body?.input ?? req.body);
      if (!validation.ok) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const requestedModel = req.body?.modelId;
      const modelId: ModelId = isValidModelId(requestedModel) ? requestedModel : ws.activeModelId;
      const result = explainAndPredict(ws.artifacts, modelId, validation.data);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Prediction failed.' });
    }
  });

  app.post('/api/select-model', (req, res) => {
    try {
      const ws = getOrInitState();
      const modelId = req.body?.modelId;
      if (!isValidModelId(modelId)) {
        res.status(400).json({ error: 'Invalid modelId.' });
        return;
      }
      ws.activeModelId = modelId;
      ws.scoredEmployees = scoreAllEmployees(ws.employees, ws.artifacts, modelId);
      res.json(toPayload(ws));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Model switch failed.' });
    }
  });

  app.post('/api/upload', (req, res) => {
    try {
      const csvText = req.body?.csvText;
      if (typeof csvText !== 'string' || csvText.trim().length < 20) {
        res.status(400).json({ error: 'Uploaded CSV content is empty or invalid.' });
        return;
      }
      const rawMapping = req.body?.mapping;
      let mapping: Partial<ColumnMapping> | undefined;
      if (rawMapping && typeof rawMapping === 'object' && !Array.isArray(rawMapping)) {
        const sanitized: Record<string, string | null> = {};
        for (const [k, v] of Object.entries(rawMapping as Record<string, unknown>)) {
          if (typeof v === 'string' && v.trim().length > 0) {
            sanitized[k] = v;
          } else if (v === null) {
            sanitized[k] = null;
          }
        }
        mapping = sanitized as Partial<ColumnMapping>;
      }
      state = buildWorkspaceState(csvText, true, mapping);
      res.json(toPayload(state));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to process uploaded CSV.' });
    }
  });

  app.post('/api/reset-dataset', (_req, res) => {
    try {
      const csvText = fs.readFileSync(DEFAULT_DATASET_PATH, 'utf8');
      state = buildWorkspaceState(csvText, false);
      res.json(toPayload(state));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to reset dataset.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Meridian Attrition Analytics running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
