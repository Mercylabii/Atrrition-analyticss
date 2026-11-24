import type {
  CleanEmployee,
  ConfusionMatrix,
  FactorContribution,
  FairnessAuditReport,
  FairnessGroupMetric,
  FeatureImportanceItem,
  ModelEvaluation,
  ModelId,
  PredictionInput,
  PredictionResult,
  RiskLevel,
  RocPoint,
  ScoredEmployee,
  TrainingSummary,
} from '../shared/types.ts';

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sigmoid(z: number): number {
  if (z > 35) return 1 - 1e-15;
  if (z < -35) return 1e-15;
  return 1 / (1 + Math.exp(-z));
}

function logit(p: number): number {
  const clamped = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(clamped / (1 - clamped));
}

interface FeatureSpec {
  names: string[];
  groups: string[];
  means: number[];
  stds: number[];
  departments: string[];
  jobRoles: string[];
  employmentTypes: string[];
  roleMedians: Record<string, number>;
  globalMedianSalary: number;
  snapshotTs: number;
  priorOffsetLogit: number;
  baselineInput: PredictionInput;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mode(values: string[]): string {
  const counts: Record<string, number> = {};
  let best = values[0] ?? '';
  let bestCount = 0;
  for (const v of values) {
    counts[v] = (counts[v] ?? 0) + 1;
    if (counts[v] > bestCount) {
      best = v;
      bestCount = counts[v];
    }
  }
  return best;
}

function buildFeatureSpec(trainRows: CleanEmployee[], snapshotDate: string): FeatureSpec {
  const departments = Array.from(new Set(trainRows.map((r) => r.Department))).sort();
  const jobRoles = Array.from(new Set(trainRows.map((r) => r.Job_Role))).sort();
  const employmentTypes = Array.from(new Set(trainRows.map((r) => r.Employment_Type))).sort();

  const allSalaries = trainRows.map((r) => r.Salary_NGN);
  const globalMedianSalary = median(allSalaries) || 500000;

  const roleSalaryBuckets: Record<string, number[]> = {};
  for (const r of trainRows) {
    roleSalaryBuckets[r.Job_Role] ??= [];
    roleSalaryBuckets[r.Job_Role].push(r.Salary_NGN);
  }

  const roleMedians: Record<string, number> = {};
  for (const [role, sals] of Object.entries(roleSalaryBuckets)) {
    roleMedians[role] = median(sals) || globalMedianSalary;
  }

  const names: string[] = [
    'Salary_NGN',
    'Log_Salary',
    'Salary_Role_Ratio',
    'Performance_Rating',
    'Training_Hours',
    'Absence_Days',
    'Job_Satisfaction_Score',
    'Overtime',
    'Tenure_Since_Hire_Months',
    'Overtime_x_LowSat',
  ];
  const groups: string[] = [
    'Salary',
    'Salary',
    'Salary',
    'Performance Rating',
    'Training Hours',
    'Absence Days',
    'Job Satisfaction',
    'Overtime',
    'Tenure',
    'Overtime',
  ];

  for (const d of departments) {
    names.push(`Dept:${d}`);
    groups.push('Department');
  }
  for (const jr of jobRoles) {
    names.push(`Role:${jr}`);
    groups.push('Job Role');
  }
  for (const et of employmentTypes) {
    names.push(`EmpType:${et}`);
    groups.push('Employment Type');
  }

  const snapshotTs = new Date(`${snapshotDate}T00:00:00Z`).getTime();

  const tempSpec: FeatureSpec = {
    names,
    groups,
    means: new Array(names.length).fill(0),
    stds: new Array(names.length).fill(1),
    departments,
    jobRoles,
    employmentTypes,
    roleMedians,
    globalMedianSalary,
    snapshotTs,
    priorOffsetLogit: 0,
    baselineInput: {
      Age: 34,
      Gender: 'Female',
      Department: mode(trainRows.map((r) => r.Department)),
      Job_Role: mode(trainRows.map((r) => r.Job_Role)),
      Employment_Type: mode(trainRows.map((r) => r.Employment_Type)),
      Salary_NGN: Math.round(globalMedianSalary),
      Performance_Rating: Math.round(median(trainRows.map((r) => r.Performance_Rating))) || 3,
      Training_Hours: Math.round(median(trainRows.map((r) => r.Training_Hours))) || 28,
      Absence_Days: Math.round(median(trainRows.map((r) => r.Absence_Days))) || 8,
      Job_Satisfaction_Score: Math.round(median(trainRows.map((r) => r.Job_Satisfaction_Score))) || 3,
      Overtime: 'No',
      Manager: mode(trainRows.map((r) => r.Manager)),
      Hire_Date: trainRows[Math.floor(trainRows.length / 2)]?.Hire_Date ?? '2022-01-01',
    },
  };

  const medTenure = median(trainRows.map((r) => r.tenureSinceHireMonths));
  const baseHireTs = snapshotTs - medTenure * MS_PER_MONTH;
  tempSpec.baselineInput.Hire_Date = new Date(baseHireTs).toISOString().slice(0, 10);

  const numNumeric = 10;
  const rawVectors = trainRows.map((r) => vectorizeRaw(r, tempSpec));
  for (let j = 0; j < numNumeric; j++) {
    let sum = 0;
    for (let i = 0; i < rawVectors.length; i++) sum += rawVectors[i][j];
    const mean = sum / (rawVectors.length || 1);
    let sq = 0;
    for (let i = 0; i < rawVectors.length; i++) {
      const diff = rawVectors[i][j] - mean;
      sq += diff * diff;
    }
    const std = Math.sqrt(sq / (rawVectors.length || 1)) || 1;
    tempSpec.means[j] = mean;
    tempSpec.stds[j] = std;
  }

  const pos = trainRows.filter((r) => r.attritionFlag === 1).length;
  const neg = trainRows.length - pos;
  if (pos > 0 && neg > 0) {
    tempSpec.priorOffsetLogit = Math.log(neg / pos);
  }

  return tempSpec;
}

function vectorizeRaw(
  row: Pick<
    CleanEmployee,
    | 'Department'
    | 'Job_Role'
    | 'Employment_Type'
    | 'Salary_NGN'
    | 'Performance_Rating'
    | 'Training_Hours'
    | 'Absence_Days'
    | 'Job_Satisfaction_Score'
    | 'Overtime'
    | 'Manager'
    | 'Hire_Date'
  >,
  spec: FeatureSpec
): number[] {
  const hireTs = new Date(`${row.Hire_Date}T00:00:00Z`).getTime();
  const tenureMonths = Number.isFinite(hireTs)
    ? Math.max(0.5, (spec.snapshotTs - hireTs) / MS_PER_MONTH)
    : 24;
  const roleMed = spec.roleMedians[row.Job_Role] ?? spec.globalMedianSalary;
  const salaryRatio = row.Salary_NGN / (roleMed || 1);
  const otFlag = row.Overtime === 'Yes' ? 1 : 0;
  const otLowSat = otFlag * (6 - row.Job_Satisfaction_Score);

  const vec: number[] = [
    row.Salary_NGN,
    Math.log(Math.max(1000, row.Salary_NGN)),
    salaryRatio,
    row.Performance_Rating,
    row.Training_Hours,
    row.Absence_Days,
    row.Job_Satisfaction_Score,
    otFlag,
    tenureMonths,
    otLowSat,
  ];

  for (const d of spec.departments) vec.push(row.Department === d ? 1 : 0);
  for (const jr of spec.jobRoles) vec.push(row.Job_Role === jr ? 1 : 0);
  for (const et of spec.employmentTypes) vec.push(row.Employment_Type === et ? 1 : 0);

  return vec;
}

function vectorizeNormalized(
  row: Parameters<typeof vectorizeRaw>[0],
  spec: FeatureSpec
): number[] {
  const raw = vectorizeRaw(row, spec);
  for (let j = 0; j < 10; j++) {
    raw[j] = (raw[j] - spec.means[j]) / spec.stds[j];
  }
  return raw;
}

function computeClassWeights(y: number[]): number[] {
  const n = y.length;
  let pos = 0;
  for (const v of y) if (v === 1) pos++;
  const neg = n - pos;
  if (pos === 0 || neg === 0) return new Array(n).fill(1);
  const w1 = n / (2 * pos);
  const w0 = n / (2 * neg);
  return y.map((v) => (v === 1 ? w1 : w0));
}

// ==========================================
// 1. LOGISTIC REGRESSION (L2 + Adam + Class Weights)
// ==========================================
interface TrainedLogistic {
  weights: number[];
  bias: number;
  priorOffsetLogit: number;
}

function trainLogisticRegression(
  X: number[][],
  y: number[],
  sampleWeights: number[],
  priorOffsetLogit: number
): TrainedLogistic {
  const n = X.length;
  const d = X[0].length;
  const weights = new Array(d).fill(0);
  let bias = 0;

  const lr = 0.04;
  const l2 = 0.03;
  const epochs = 260;

  const mW = new Array(d).fill(0);
  const vW = new Array(d).fill(0);
  let mB = 0;
  let vB = 0;
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;

  for (let epoch = 1; epoch <= epochs; epoch++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      let z = bias;
      const xi = X[i];
      for (let j = 0; j < d; j++) {
        if (xi[j] !== 0) z += weights[j] * xi[j];
      }
      const p = sigmoid(z);
      const err = (p - y[i]) * sampleWeights[i];
      gradB += err;
      for (let j = 0; j < d; j++) {
        if (xi[j] !== 0) gradW[j] += err * xi[j];
      }
    }

    const invN = 1 / n;
    gradB *= invN;
    mB = beta1 * mB + (1 - beta1) * gradB;
    vB = beta2 * vB + (1 - beta2) * gradB * gradB;
    const mBHat = mB / (1 - Math.pow(beta1, epoch));
    const vBHat = vB / (1 - Math.pow(beta2, epoch));
    bias -= (lr * mBHat) / (Math.sqrt(vBHat) + eps);

    for (let j = 0; j < d; j++) {
      const g = gradW[j] * invN + l2 * weights[j];
      mW[j] = beta1 * mW[j] + (1 - beta1) * g;
      vW[j] = beta2 * vW[j] + (1 - beta2) * g * g;
      const mHat = mW[j] / (1 - Math.pow(beta1, epoch));
      const vHat = vW[j] / (1 - Math.pow(beta2, epoch));
      weights[j] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
    }
  }

  return { weights, bias, priorOffsetLogit };
}

function predictLogisticProb(model: TrainedLogistic, x: number[]): number {
  let z = model.bias;
  for (let j = 0; j < x.length; j++) {
    if (x[j] !== 0) z += model.weights[j] * x[j];
  }
  return sigmoid(z - model.priorOffsetLogit);
}

// ==========================================
// 2. CART DECISION TREE (Classification & Regression)
// ==========================================
interface TreeNode {
  isLeaf: boolean;
  value: number;
  featureIndex: number;
  threshold: number;
  left: TreeNode | null;
  right: TreeNode | null;
}

function buildGiniTree(
  X: number[][],
  y: number[],
  weights: number[],
  indices: number[],
  depth: number,
  maxDepth: number,
  minSamplesLeaf: number,
  featureSubsetSize: number,
  rand: () => number,
  featureGains: number[]
): TreeNode {
  let wSum = 0;
  let wPos = 0;
  let rawPos = 0;
  for (const idx of indices) {
    const w = weights[idx];
    wSum += w;
    if (y[idx] === 1) {
      wPos += w;
      rawPos += 1;
    }
  }

  const p = wSum > 0 ? wPos / wSum : 0;
  const leafProb = (rawPos + 0.45) / (indices.length + 2);
  const parentGini = 2 * p * (1 - p);

  if (
    depth >= maxDepth ||
    indices.length < minSamplesLeaf * 2 ||
    p <= 1e-6 ||
    p >= 1 - 1e-6
  ) {
    return { isLeaf: true, value: leafProb, featureIndex: -1, threshold: 0, left: null, right: null };
  }

  const d = X[0].length;
  const featIndices: number[] = [];
  if (featureSubsetSize >= d) {
    for (let j = 0; j < d; j++) featIndices.push(j);
  } else {
    const pool = Array.from({ length: d }, (_, k) => k);
    for (let k = 0; k < featureSubsetSize; k++) {
      const rIdx = k + Math.floor(rand() * (d - k));
      const tmp = pool[k];
      pool[k] = pool[rIdx];
      pool[rIdx] = tmp;
      featIndices.push(pool[k]);
    }
  }

  let bestGain = 0;
  let bestFeature = -1;
  let bestThreshold = 0;

  for (const f of featIndices) {
    const pairs: Array<{ val: number; y: number; w: number }> = [];
    for (const idx of indices) {
      pairs.push({ val: X[idx][f], y: y[idx], w: weights[idx] });
    }
    pairs.sort((a, b) => a.val - b.val);

    let leftW = 0;
    let leftPos = 0;
    let leftCount = 0;

    for (let i = 0; i < pairs.length - 1; i++) {
      leftW += pairs[i].w;
      if (pairs[i].y === 1) leftPos += pairs[i].w;
      leftCount++;

      const rightCount = pairs.length - leftCount;
      if (pairs[i].val === pairs[i + 1].val) continue;
      if (leftCount < minSamplesLeaf || rightCount < minSamplesLeaf) continue;

      const rightW = wSum - leftW;
      const rightPos = wPos - leftPos;
      if (leftW <= 0 || rightW <= 0) continue;

      const pL = leftPos / leftW;
      const pR = rightPos / rightW;
      const giniL = 2 * pL * (1 - pL);
      const giniR = 2 * pR * (1 - pR);
      const weightedChildGini = (leftW / wSum) * giniL + (rightW / wSum) * giniR;
      const gain = (parentGini - weightedChildGini) * wSum;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = (pairs[i].val + pairs[i + 1].val) / 2;
      }
    }
  }

  if (bestFeature === -1 || bestGain <= 1e-7) {
    return { isLeaf: true, value: leafProb, featureIndex: -1, threshold: 0, left: null, right: null };
  }

  featureGains[bestFeature] += bestGain;

  const leftIndices: number[] = [];
  const rightIndices: number[] = [];
  for (const idx of indices) {
    if (X[idx][bestFeature] <= bestThreshold) leftIndices.push(idx);
    else rightIndices.push(idx);
  }

  return {
    isLeaf: false,
    value: leafProb,
    featureIndex: bestFeature,
    threshold: bestThreshold,
    left: buildGiniTree(
      X,
      y,
      weights,
      leftIndices,
      depth + 1,
      maxDepth,
      minSamplesLeaf,
      featureSubsetSize,
      rand,
      featureGains
    ),
    right: buildGiniTree(
      X,
      y,
      weights,
      rightIndices,
      depth + 1,
      maxDepth,
      minSamplesLeaf,
      featureSubsetSize,
      rand,
      featureGains
    ),
  };
}

function predictTree(node: TreeNode, x: number[]): number {
  let curr = node;
  while (!curr.isLeaf) {
    if (x[curr.featureIndex] <= curr.threshold) {
      curr = curr.left!;
    } else {
      curr = curr.right!;
    }
  }
  return curr.value;
}

// ==========================================
// 3. RANDOM FOREST
// ==========================================
interface TrainedRandomForest {
  trees: TreeNode[];
  featureImportances: number[];
  priorOffsetLogit: number;
}

function trainRandomForest(
  X: number[][],
  y: number[],
  sampleWeights: number[],
  priorOffsetLogit: number,
  seed: number
): TrainedRandomForest {
  const n = X.length;
  const d = X[0].length;
  const numTrees = 60;
  const maxDepth = 6;
  const minSamplesLeaf = Math.max(8, Math.floor(n * 0.025));
  const mtry = Math.max(4, Math.round(Math.sqrt(d)));
  const rand = mulberry32(seed);
  const featureGains = new Array(d).fill(0);
  const trees: TreeNode[] = [];

  for (let t = 0; t < numTrees; t++) {
    const bootIndices: number[] = [];
    for (let i = 0; i < n; i++) {
      bootIndices.push(Math.floor(rand() * n));
    }
    trees.push(
      buildGiniTree(
        X,
        y,
        sampleWeights,
        bootIndices,
        0,
        maxDepth,
        minSamplesLeaf,
        mtry,
        rand,
        featureGains
      )
    );
  }

  const totalGain = featureGains.reduce((a, b) => a + b, 0) || 1;
  return {
    trees,
    featureImportances: featureGains.map((g) => g / totalGain),
    priorOffsetLogit,
  };
}

function predictRandomForestProb(model: TrainedRandomForest, x: number[]): number {
  let sum = 0;
  for (const tree of model.trees) {
    sum += predictTree(tree, x);
  }
  return Math.min(0.98, Math.max(0.02, sum / model.trees.length));
}

// ==========================================
// 4. GRADIENT BOOSTED TREES (Log-Loss GBM)
// ==========================================
interface TrainedGBM {
  initLogOdds: number;
  learningRate: number;
  trees: TreeNode[];
  featureImportances: number[];
  priorOffsetLogit: number;
}

function buildRegressionTree(
  X: number[][],
  residuals: number[],
  hessians: number[],
  indices: number[],
  depth: number,
  maxDepth: number,
  minSamplesLeaf: number,
  featureGains: number[]
): TreeNode {
  let gSum = 0;
  let hSum = 0;
  for (const idx of indices) {
    gSum += residuals[idx];
    hSum += hessians[idx];
  }
  const lambda = 2.5;
  const leafValue = gSum / (hSum + lambda);

  if (depth >= maxDepth || indices.length < minSamplesLeaf * 2) {
    return { isLeaf: true, value: leafValue, featureIndex: -1, threshold: 0, left: null, right: null };
  }

  const d = X[0].length;
  const parentScore = (gSum * gSum) / (hSum + lambda);
  let bestGain = 0;
  let bestFeature = -1;
  let bestThreshold = 0;

  for (let f = 0; f < d; f++) {
    const items: Array<{ val: number; g: number; h: number }> = [];
    for (const idx of indices) {
      items.push({ val: X[idx][f], g: residuals[idx], h: hessians[idx] });
    }
    items.sort((a, b) => a.val - b.val);

    let gL = 0;
    let hL = 0;
    for (let i = 0; i < items.length - 1; i++) {
      gL += items[i].g;
      hL += items[i].h;
      const leftCount = i + 1;
      const rightCount = items.length - leftCount;
      if (items[i].val === items[i + 1].val) continue;
      if (leftCount < minSamplesLeaf || rightCount < minSamplesLeaf) continue;

      const gR = gSum - gL;
      const hR = hSum - hL;
      const score = (gL * gL) / (hL + lambda) + (gR * gR) / (hR + lambda);
      const gain = score - parentScore;
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = (items[i].val + items[i + 1].val) / 2;
      }
    }
  }

  if (bestFeature === -1 || bestGain <= 1e-6) {
    return { isLeaf: true, value: leafValue, featureIndex: -1, threshold: 0, left: null, right: null };
  }

  featureGains[bestFeature] += bestGain;

  const leftIndices: number[] = [];
  const rightIndices: number[] = [];
  for (const idx of indices) {
    if (X[idx][bestFeature] <= bestThreshold) leftIndices.push(idx);
    else rightIndices.push(idx);
  }

  return {
    isLeaf: false,
    value: leafValue,
    featureIndex: bestFeature,
    threshold: bestThreshold,
    left: buildRegressionTree(
      X,
      residuals,
      hessians,
      leftIndices,
      depth + 1,
      maxDepth,
      minSamplesLeaf,
      featureGains
    ),
    right: buildRegressionTree(
      X,
      residuals,
      hessians,
      rightIndices,
      depth + 1,
      maxDepth,
      minSamplesLeaf,
      featureGains
    ),
  };
}

function trainGradientBoosting(
  X: number[][],
  y: number[],
  sampleWeights: number[],
  priorOffsetLogit: number
): TrainedGBM {
  const n = X.length;
  const d = X[0].length;
  const numEstimators = 48;
  const learningRate = 0.065;
  const maxDepth = 3;
  const minSamplesLeaf = Math.max(5, Math.floor(n * 0.015));

  let wPos = 0;
  let wTotal = 0;
  for (let i = 0; i < n; i++) {
    wTotal += sampleWeights[i];
    if (y[i] === 1) wPos += sampleWeights[i];
  }
  const initLogOdds = logit(wTotal > 0 ? wPos / wTotal : 0.5);
  const fVals = new Array(n).fill(initLogOdds);
  const allIndices = Array.from({ length: n }, (_, i) => i);
  const trees: TreeNode[] = [];
  const featureGains = new Array(d).fill(0);

  for (let m = 0; m < numEstimators; m++) {
    const residuals = new Array(n);
    const hessians = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = sigmoid(fVals[i]);
      const w = sampleWeights[i];
      residuals[i] = w * (y[i] - p);
      hessians[i] = Math.max(1e-4, w * p * (1 - p));
    }

    const tree = buildRegressionTree(
      X,
      residuals,
      hessians,
      allIndices,
      0,
      maxDepth,
      minSamplesLeaf,
      featureGains
    );
    trees.push(tree);

    for (let i = 0; i < n; i++) {
      fVals[i] += learningRate * predictTree(tree, X[i]);
    }
  }

  const totalGain = featureGains.reduce((a, b) => a + b, 0) || 1;
  return {
    initLogOdds,
    learningRate,
    trees,
    featureImportances: featureGains.map((g) => g / totalGain),
    priorOffsetLogit,
  };
}

function predictGBMProb(model: TrainedGBM, x: number[]): number {
  let z = model.initLogOdds;
  for (const tree of model.trees) {
    z += model.learningRate * predictTree(tree, x);
  }
  return sigmoid(z - model.priorOffsetLogit);
}

// ==========================================
// 5. METRICS, ROC-AUC, & SPLITS
// ==========================================
function computeMetricsAtThreshold(
  yTrue: number[],
  probs: number[],
  threshold: number
): {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  confusionMatrix: ConfusionMatrix;
} {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const pred = probs[i] >= threshold ? 1 : 0;
    if (pred === 1 && yTrue[i] === 1) tp++;
    else if (pred === 1 && yTrue[i] === 0) fp++;
    else if (pred === 0 && yTrue[i] === 0) tn++;
    else fn++;
  }
  const n = yTrue.length || 1;
  const accuracy = (tp + tn) / n;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    accuracy,
    precision,
    recall,
    f1,
    confusionMatrix: { tn, fp, fn, tp },
  };
}

function computeRocAndAuc(
  yTrue: number[],
  probs: number[]
): { rocAuc: number; rocCurve: RocPoint[] } {
  const totalPos = yTrue.filter((v) => v === 1).length;
  const totalNeg = yTrue.length - totalPos;
  if (totalPos === 0 || totalNeg === 0) {
    return {
      rocAuc: 0.5,
      rocCurve: [
        { fpr: 0, tpr: 0, threshold: 1 },
        { fpr: 1, tpr: 1, threshold: 0 },
      ],
    };
  }

  const pairs = yTrue
    .map((y, i) => ({ y, p: probs[i] }))
    .sort((a, b) => b.p - a.p);

  const rocCurve: RocPoint[] = [{ fpr: 0, tpr: 0, threshold: 1 }];
  let tp = 0;
  let fp = 0;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].y === 1) tp++;
    else fp++;
    if (i === pairs.length - 1 || pairs[i].p !== pairs[i + 1].p) {
      rocCurve.push({
        fpr: Number((fp / totalNeg).toFixed(4)),
        tpr: Number((tp / totalPos).toFixed(4)),
        threshold: Number(pairs[i].p.toFixed(4)),
      });
    }
  }

  let auc = 0;
  for (let i = 1; i < rocCurve.length; i++) {
    const dx = rocCurve[i].fpr - rocCurve[i - 1].fpr;
    const avgY = (rocCurve[i].tpr + rocCurve[i - 1].tpr) / 2;
    auc += dx * avgY;
  }

  const sampled: RocPoint[] = [];
  const step = Math.max(1, Math.floor(rocCurve.length / 36));
  for (let i = 0; i < rocCurve.length; i += step) sampled.push(rocCurve[i]);
  if (sampled[sampled.length - 1] !== rocCurve[rocCurve.length - 1]) {
    sampled.push(rocCurve[rocCurve.length - 1]);
  }

  return { rocAuc: auc, rocCurve: sampled };
}

function findOptimalThreshold(yTrue: number[], probs: number[]): number {
  let bestT = 0.28;
  let bestF1 = -1;
  for (let t = 0.15; t <= 0.60; t += 0.025) {
    const m = computeMetricsAtThreshold(yTrue, probs, t);
    if (m.f1 > bestF1) {
      bestF1 = m.f1;
      bestT = t;
    }
  }
  return Number(bestT.toFixed(3));
}

function stratifiedSplit(
  rows: CleanEmployee[],
  testRatio: number,
  seed: number
): { train: CleanEmployee[]; test: CleanEmployee[] } {
  const rand = mulberry32(seed);
  const pos = rows.filter((r) => r.attritionFlag === 1);
  const neg = rows.filter((r) => r.attritionFlag === 0);

  const shuffle = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  };

  const posShuf = shuffle(pos);
  const negShuf = shuffle(neg);
  const posTestCount = Math.min(posShuf.length - 1, Math.max(1, Math.round(posShuf.length * testRatio)));
  const negTestCount = Math.min(negShuf.length - 1, Math.max(1, Math.round(negShuf.length * testRatio)));

  const test = [...posShuf.slice(0, posTestCount), ...negShuf.slice(0, negTestCount)];
  const train = [...posShuf.slice(posTestCount), ...negShuf.slice(negTestCount)];
  return { train: shuffle(train), test: shuffle(test) };
}

function stratifiedKFolds(rows: CleanEmployee[], k: number, seed: number): CleanEmployee[][] {
  const rand = mulberry32(seed);
  const shuffle = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  };
  const pos = shuffle(rows.filter((r) => r.attritionFlag === 1));
  const neg = shuffle(rows.filter((r) => r.attritionFlag === 0));
  const folds: CleanEmployee[][] = Array.from({ length: k }, () => []);
  pos.forEach((r, i) => folds[i % k].push(r));
  neg.forEach((r, i) => folds[i % k].push(r));
  return folds;
}

function aggregateGroupImportances(
  rawImportances: number[],
  spec: FeatureSpec
): FeatureImportanceItem[] {
  const grouped: Record<string, number> = {};
  for (let j = 0; j < rawImportances.length; j++) {
    const grp = spec.groups[j];
    grouped[grp] = (grouped[grp] ?? 0) + Math.abs(rawImportances[j]);
  }
  const total = Object.values(grouped).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(grouped)
    .map(([feature, val]) => ({
      feature,
      label: feature,
      importance: Number(((val / total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.importance - a.importance);
}

// ==========================================
// 6. TRAINED WORKSPACE ENGINE CLASS
// ==========================================
export interface TrainedArtifacts {
  spec: FeatureSpec;
  logistic: TrainedLogistic;
  randomForest: TrainedRandomForest;
  gbm: TrainedGBM;
  summary: TrainingSummary;
  oofProbsByModel: Record<ModelId, number[]>;
}

export function classifyRisk(prob: number): RiskLevel {
  if (prob >= 0.65) return 'High Risk';
  if (prob >= 0.35) return 'Medium Risk';
  return 'Low Risk';
}

export function trainAndEvaluateModels(
  employees: CleanEmployee[],
  snapshotDate: string
): TrainedArtifacts {
  const totalSamples = employees.length;
  const positiveCount = employees.filter((e) => e.attritionFlag === 1).length;
  const positiveRate = totalSamples > 0 ? positiveCount / totalSamples : 0;
  const negCount = totalSamples - positiveCount;
  if (positiveCount < 2 || negCount < 2) {
    throw new Error(
      `Dataset must contain at least 2 exited employees and 2 retained employees to train and evaluate predictive models (found ${positiveCount} exited, ${negCount} retained).`
    );
  }
  const classImbalanceRatio = positiveCount > 0 ? Number((negCount / positiveCount).toFixed(2)) : 0;

  let adequacyStatus: 'adequate' | 'limited' | 'insufficient' = 'adequate';
  let adequacyMessage = `Dataset contains ${totalSamples} validated records (${positiveCount} exits, ${(positiveRate * 100).toFixed(1)}% attrition rate), supporting stratified 80/20 evaluation and 5-fold cross-validation.`;

  if (totalSamples < 80 || positiveCount < 10) {
    adequacyStatus = 'insufficient';
    adequacyMessage = `Dataset has only ${totalSamples} records (${positiveCount} exits). Predictive estimates are unreliable on small samples and should be treated as exploratory only.`;
  } else if (totalSamples < 200 || positiveCount < 25) {
    adequacyStatus = 'limited';
    adequacyMessage = `Dataset contains ${totalSamples} records (${positiveCount} exits). Moderate sample size—interpret predictions cautiously alongside manager context.`;
  }

  const { train, test } = stratifiedSplit(employees, 0.2, 42);
  const trainSpec = buildFeatureSpec(train, snapshotDate);
  const XTrain = train.map((r) => vectorizeNormalized(r, trainSpec));
  const yTrain = train.map((r) => r.attritionFlag);
  const wTrain = computeClassWeights(yTrain);

  const XTest = test.map((r) => vectorizeNormalized(r, trainSpec));
  const yTest = test.map((r) => r.attritionFlag);

  const lrSplit = trainLogisticRegression(XTrain, yTrain, wTrain, trainSpec.priorOffsetLogit);
  const rfSplit = trainRandomForest(XTrain, yTrain, wTrain, trainSpec.priorOffsetLogit, 101);
  const gbmSplit = trainGradientBoosting(XTrain, yTrain, wTrain, trainSpec.priorOffsetLogit);

  const lrTrainProbs = XTrain.map((x) => predictLogisticProb(lrSplit, x));
  const rfTrainProbs = XTrain.map((x) => predictRandomForestProb(rfSplit, x));
  const gbmTrainProbs = XTrain.map((x) => predictGBMProb(gbmSplit, x));

  const lrThresh = findOptimalThreshold(yTrain, lrTrainProbs);
  const rfThresh = findOptimalThreshold(yTrain, rfTrainProbs);
  const gbmThresh = findOptimalThreshold(yTrain, gbmTrainProbs);

  const lrTestProbs = XTest.map((x) => predictLogisticProb(lrSplit, x));
  const rfTestProbs = XTest.map((x) => predictRandomForestProb(rfSplit, x));
  const gbmTestProbs = XTest.map((x) => predictGBMProb(gbmSplit, x));

  const k = Math.min(5, Math.max(2, Math.min(positiveCount, negCount)));
  const folds = stratifiedKFolds(employees, k, 2026);
  const cvMetrics: Record<ModelId, { aucs: number[]; f1s: number[]; accs: number[] }> = {
    logistic_regression: { aucs: [], f1s: [], accs: [] },
    random_forest: { aucs: [], f1s: [], accs: [] },
    gradient_boosting: { aucs: [], f1s: [], accs: [] },
  };

  const empIndexMap = new Map<string, number>();
  employees.forEach((e, idx) => empIndexMap.set(e.Employee_ID, idx));
  const oofProbsByModel: Record<ModelId, number[]> = {
    logistic_regression: new Array(totalSamples).fill(positiveRate),
    random_forest: new Array(totalSamples).fill(positiveRate),
    gradient_boosting: new Array(totalSamples).fill(positiveRate),
  };

  for (let f = 0; f < k; f++) {
    const valRows = folds[f];
    const trRows = folds.flatMap((fold, idx) => (idx === f ? [] : fold));
    if (valRows.length === 0 || trRows.length === 0) continue;

    const foldSpec = buildFeatureSpec(trRows, snapshotDate);
    const XFTrain = trRows.map((r) => vectorizeNormalized(r, foldSpec));
    const yFTrain = trRows.map((r) => r.attritionFlag);
    const wFTrain = computeClassWeights(yFTrain);

    const XFVal = valRows.map((r) => vectorizeNormalized(r, foldSpec));
    const yFVal = valRows.map((r) => r.attritionFlag);

    const lrF = trainLogisticRegression(XFTrain, yFTrain, wFTrain, foldSpec.priorOffsetLogit);
    const rfF = trainRandomForest(XFTrain, yFTrain, wFTrain, foldSpec.priorOffsetLogit, 300 + f);
    const gbmF = trainGradientBoosting(XFTrain, yFTrain, wFTrain, foldSpec.priorOffsetLogit);

    const pLr = XFVal.map((x) => predictLogisticProb(lrF, x));
    const pRf = XFVal.map((x) => predictRandomForestProb(rfF, x));
    const pGbm = XFVal.map((x) => predictGBMProb(gbmF, x));

    valRows.forEach((vr, i) => {
      const globalIdx = empIndexMap.get(vr.Employee_ID);
      if (globalIdx !== undefined) {
        oofProbsByModel.logistic_regression[globalIdx] = pLr[i];
        oofProbsByModel.random_forest[globalIdx] = pRf[i];
        oofProbsByModel.gradient_boosting[globalIdx] = pGbm[i];
      }
    });

    const recordFold = (id: ModelId, probs: number[], thresh: number) => {
      const { rocAuc } = computeRocAndAuc(yFVal, probs);
      const m = computeMetricsAtThreshold(yFVal, probs, thresh);
      cvMetrics[id].aucs.push(rocAuc);
      cvMetrics[id].f1s.push(m.f1);
      cvMetrics[id].accs.push(m.accuracy);
    };

    recordFold('logistic_regression', pLr, lrThresh);
    recordFold('random_forest', pRf, rfThresh);
    recordFold('gradient_boosting', pGbm, gbmThresh);
  }

  const meanStd = (arr: number[]) => {
    const mean = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (arr.length || 1);
    return { mean, std: Math.sqrt(variance) };
  };

  const buildEval = (
    modelId: ModelId,
    modelName: string,
    description: string,
    testProbs: number[],
    thresh: number,
    rawImportances: number[]
  ): ModelEvaluation => {
    const m = computeMetricsAtThreshold(yTest, testProbs, thresh);
    const { rocAuc, rocCurve } = computeRocAndAuc(yTest, testProbs);
    const cvAuc = meanStd(cvMetrics[modelId].aucs);
    const cvF1 = meanStd(cvMetrics[modelId].f1s);
    const cvAcc = meanStd(cvMetrics[modelId].accs);

    return {
      modelId,
      modelName,
      description,
      testAccuracy: Number(m.accuracy.toFixed(4)),
      testPrecision: Number(m.precision.toFixed(4)),
      testRecall: Number(m.recall.toFixed(4)),
      testF1: Number(m.f1.toFixed(4)),
      testRocAuc: Number(rocAuc.toFixed(4)),
      cvRocAucMean: Number(cvAuc.mean.toFixed(4)),
      cvRocAucStd: Number(cvAuc.std.toFixed(4)),
      cvF1Mean: Number(cvF1.mean.toFixed(4)),
      cvAccuracyMean: Number(cvAcc.mean.toFixed(4)),
      confusionMatrix: m.confusionMatrix,
      rocCurve,
      featureImportances: aggregateGroupImportances(rawImportances, trainSpec),
      threshold: thresh,
    };
  };

  const models: ModelEvaluation[] = [
    buildEval(
      'logistic_regression',
      'Logistic Regression',
      'L2-regularized linear log-odds classifier with class-balanced weights.',
      lrTestProbs,
      lrThresh,
      lrSplit.weights
    ),
    buildEval(
      'random_forest',
      'Random Forest',
      '60-tree bagged Gini ensemble with balanced class weights.',
      rfTestProbs,
      rfThresh,
      rfSplit.featureImportances
    ),
    buildEval(
      'gradient_boosting',
      'Gradient Boosting',
      '48-stage log-loss boosted trees capturing non-linear interactions.',
      gbmTestProbs,
      gbmThresh,
      gbmSplit.featureImportances
    ),
  ];

  const sortedModels = [...models].sort(
    (a, b) => b.cvRocAucMean * 0.6 + b.testRocAuc * 0.4 - (a.cvRocAucMean * 0.6 + a.testRocAuc * 0.4)
  );
  const activeModelId = sortedModels[0].modelId;

  const activeProbsMap: Record<ModelId, number[]> = {
    logistic_regression: lrTestProbs,
    random_forest: rfTestProbs,
    gradient_boosting: gbmTestProbs,
  };
  const activeEval = models.find((m) => m.modelId === activeModelId)!;
  const fairnessAudit = computeFairnessAudit(
    test,
    activeProbsMap[activeModelId],
    activeEval.threshold
  );

  // Fit final production models on 100% of validated historical data
  const fullSpec = buildFeatureSpec(employees, snapshotDate);
  const XFull = employees.map((r) => vectorizeNormalized(r, fullSpec));
  const yFull = employees.map((r) => r.attritionFlag);
  const wFull = computeClassWeights(yFull);

  const logistic = trainLogisticRegression(XFull, yFull, wFull, fullSpec.priorOffsetLogit);
  const randomForest = trainRandomForest(XFull, yFull, wFull, fullSpec.priorOffsetLogit, 777);
  const gbm = trainGradientBoosting(XFull, yFull, wFull, fullSpec.priorOffsetLogit);

  return {
    spec: fullSpec,
    logistic,
    randomForest,
    gbm,
    oofProbsByModel,
    summary: {
      activeModelId,
      totalSamples,
      trainSamples: train.length,
      testSamples: test.length,
      positiveCount,
      positiveRate: Number((positiveRate * 100).toFixed(2)),
      classImbalanceRatio,
      adequacyStatus,
      adequacyMessage,
      excludedLeakageFields: ['Employee_ID', 'Exit_Date', 'Employment_Status', 'Attrition_Status'],
      excludedFairnessFields: ['Age', 'Gender'],
      models,
      fairnessAudit,
      trainedAt: new Date().toISOString(),
    },
  };
}

function computeFairnessAudit(
  testRows: CleanEmployee[],
  testProbs: number[],
  threshold: number
): FairnessAuditReport {
  const evalGroup = (
    groupType: 'Gender' | 'Age Group',
    groupName: string,
    indices: number[]
  ): FairnessGroupMetric => {
    const n = indices.length;
    if (n < 5) {
      return {
        groupType,
        groupName,
        sampleCount: n,
        actualAttritionRate: 0,
        predictedPositiveRate: 0,
        truePositiveRate: null,
        falsePositiveRate: null,
        suppressed: true,
      };
    }

    let actualPos = 0;
    let predPos = 0;
    let tp = 0;
    let fp = 0;
    let actualNeg = 0;

    for (const i of indices) {
      const y = testRows[i].attritionFlag;
      const pred = testProbs[i] >= threshold ? 1 : 0;
      if (y === 1) actualPos++;
      else actualNeg++;
      if (pred === 1) predPos++;
      if (y === 1 && pred === 1) tp++;
      if (y === 0 && pred === 1) fp++;
    }

    return {
      groupType,
      groupName,
      sampleCount: n,
      actualAttritionRate: Number(((actualPos / n) * 100).toFixed(1)),
      predictedPositiveRate: Number(((predPos / n) * 100).toFixed(1)),
      truePositiveRate: actualPos > 0 ? Number(((tp / actualPos) * 100).toFixed(1)) : null,
      falsePositiveRate: actualNeg > 0 ? Number(((fp / actualNeg) * 100).toFixed(1)) : null,
      suppressed: false,
    };
  };

  const groups: FairnessGroupMetric[] = [];
  const genderBuckets: Record<string, number[]> = {};
  const ageBuckets: Record<string, number[]> = {
    'Under 30': [],
    '30–39': [],
    '40+': [],
  };

  testRows.forEach((r, i) => {
    genderBuckets[r.Gender] ??= [];
    genderBuckets[r.Gender].push(i);
    if (r.Age < 30) ageBuckets['Under 30'].push(i);
    else if (r.Age <= 39) ageBuckets['30–39'].push(i);
    else ageBuckets['40+'].push(i);
  });

  for (const [gName, idxs] of Object.entries(genderBuckets).sort((a, b) => a[0].localeCompare(b[0]))) {
    groups.push(evalGroup('Gender', gName, idxs));
  }
  for (const [aName, idxs] of Object.entries(ageBuckets)) {
    groups.push(evalGroup('Age Group', aName, idxs));
  }

  const genderRates = groups
    .filter((g) => g.groupType === 'Gender' && !g.suppressed)
    .map((g) => g.predictedPositiveRate);
  const ageRates = groups
    .filter((g) => g.groupType === 'Age Group' && !g.suppressed)
    .map((g) => g.predictedPositiveRate);

  const genderMaxParityGap =
    genderRates.length >= 2
      ? Number((Math.max(...genderRates) - Math.min(...genderRates)).toFixed(1))
      : 0;
  const ageMaxParityGap =
    ageRates.length >= 2
      ? Number((Math.max(...ageRates) - Math.min(...ageRates)).toFixed(1))
      : 0;

  return {
    excludedDemographicFeatures: ['Age', 'Gender'],
    genderMaxParityGap,
    ageMaxParityGap,
    groups,
    summaryNote:
      'Age and Gender are strictly excluded from model training and prediction features. Subgroup metrics below audit demographic parity across held-out test records; groups with n < 5 are suppressed for privacy.',
  };
}

function predictWithModelId(
  artifacts: TrainedArtifacts,
  modelId: ModelId,
  x: number[]
): number {
  if (modelId === 'logistic_regression') return predictLogisticProb(artifacts.logistic, x);
  if (modelId === 'random_forest') return predictRandomForestProb(artifacts.randomForest, x);
  return predictGBMProb(artifacts.gbm, x);
}

export function explainAndPredict(
  artifacts: TrainedArtifacts,
  modelId: ModelId,
  input: PredictionInput
): PredictionResult {
  const { spec } = artifacts;
  const x = vectorizeNormalized(input, spec);
  const prob = predictWithModelId(artifacts, modelId, x);
  const probabilityPct = Math.round(prob * 100);
  const riskClassification = classifyRisk(prob);

  const base = spec.baselineInput;
  const hireTs = new Date(`${input.Hire_Date}T00:00:00Z`).getTime();
  const tenureMonths = Number.isFinite(hireTs)
    ? Math.max(0.5, (spec.snapshotTs - hireTs) / MS_PER_MONTH)
    : 24;

  const factorProbes: Array<{
    factor: string;
    detail: string;
    perturbed: PredictionInput;
  }> = [
    {
      factor: 'Job Satisfaction',
      detail: `Score ${input.Job_Satisfaction_Score}/5`,
      perturbed: { ...input, Job_Satisfaction_Score: base.Job_Satisfaction_Score },
    },
    {
      factor: 'Overtime Workload',
      detail: input.Overtime === 'Yes' ? 'Frequent Overtime (Yes)' : 'Standard Hours (No)',
      perturbed: { ...input, Overtime: base.Overtime },
    },
    {
      factor: 'Department',
      detail: input.Department,
      perturbed: { ...input, Department: base.Department },
    },
    {
      factor: 'Job Role',
      detail: input.Job_Role,
      perturbed: { ...input, Job_Role: base.Job_Role },
    },
    {
      factor: 'Compensation',
      detail: `₦${input.Salary_NGN.toLocaleString('en-US')}`,
      perturbed: { ...input, Salary_NGN: base.Salary_NGN },
    },
    {
      factor: 'Tenure',
      detail: `${tenureMonths.toFixed(1)} months since hire`,
      perturbed: { ...input, Hire_Date: base.Hire_Date },
    },
    {
      factor: 'Employment Type',
      detail: input.Employment_Type,
      perturbed: { ...input, Employment_Type: base.Employment_Type },
    },
    {
      factor: 'Absence Days',
      detail: `${input.Absence_Days} days/yr`,
      perturbed: { ...input, Absence_Days: base.Absence_Days },
    },
    {
      factor: 'Performance Rating',
      detail: `Rating ${input.Performance_Rating}/5`,
      perturbed: { ...input, Performance_Rating: base.Performance_Rating },
    },
    {
      factor: 'Training Hours',
      detail: `${input.Training_Hours} hrs/yr`,
      perturbed: { ...input, Training_Hours: base.Training_Hours },
    },
    {
      factor: 'Reporting Manager',
      detail: input.Manager,
      perturbed: { ...input, Manager: base.Manager },
    },
  ];

  const contributions: FactorContribution[] = factorProbes
    .map((probe) => {
      const pWithout = predictWithModelId(
        artifacts,
        modelId,
        vectorizeNormalized(probe.perturbed, spec)
      );
      const impact = Number(((prob - pWithout) * 100).toFixed(1));
      return {
        factor: probe.factor,
        detail: probe.detail,
        impact,
        direction: impact >= 0 ? ('increases_risk' as const) : ('reduces_risk' as const),
      };
    })
    .filter((c) => Math.abs(c.impact) >= 0.3)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 6);

  const recommendations: string[] = [];
  const roleMed = spec.roleMedians[input.Job_Role] ?? spec.globalMedianSalary;

  if (input.Job_Satisfaction_Score <= 2) {
    recommendations.push(
      'Schedule a structured stay interview and engagement check-in with HR and skip-level leadership to surface role friction.'
    );
  }
  if (input.Overtime === 'Yes') {
    recommendations.push(
      'Audit recurring overtime allocation and rebalance sprint/shift coverage to mitigate burnout risk.'
    );
  }
  if (input.Salary_NGN < roleMed * 0.9) {
    recommendations.push(
      `Benchmark compensation against the internal ${input.Job_Role} median (₦${Math.round(roleMed).toLocaleString('en-US')}) during the next pay cycle.`
    );
  }
  if (tenureMonths < 18) {
    recommendations.push(
      'Reinforce early-tenure onboarding with 90-day milestone coaching, peer mentoring, and role clarity reviews.'
    );
  }
  if (input.Absence_Days >= 12) {
    recommendations.push(
      'Review workload stress and flexible scheduling or wellness support options to address elevated absence frequency.'
    );
  }
  if (input.Training_Hours < 15) {
    recommendations.push(
      'Assign a targeted upskilling plan and career progression roadmap to increase skill investment.'
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Maintain regular quarterly growth check-ins, recognize sustained contributions, and monitor workload balance.'
    );
  }

  const modelMeta = artifacts.summary.models.find((m) => m.modelId === modelId)!;

  return {
    probability: Number(prob.toFixed(4)),
    probabilityPct,
    riskClassification,
    modelId,
    modelName: modelMeta.modelName,
    keyFactors: contributions,
    recommendations,
    adequacyWarning:
      artifacts.summary.adequacyStatus === 'adequate'
        ? null
        : artifacts.summary.adequacyMessage,
    fairnessNote:
      'Decision-support estimate only. Age and Gender are excluded from risk scoring; evaluate alongside manager context.',
  };
}

export function scoreAllEmployees(
  employees: CleanEmployee[],
  artifacts: TrainedArtifacts,
  modelId: ModelId
): ScoredEmployee[] {
  const oofProbs = artifacts.oofProbsByModel[modelId];
  return employees.map((emp, idx) => {
    const prob = oofProbs[idx] ?? 0.22;
    const { spec } = artifacts;
    const base = spec.baselineInput;
    const fullProb = predictWithModelId(artifacts, modelId, vectorizeNormalized(emp, spec));

    const quickChecks: Array<{ factor: string; detail: string; perturbed: PredictionInput }> = [
      {
        factor: 'Job Satisfaction',
        detail: `${emp.Job_Satisfaction_Score}/5`,
        perturbed: { ...emp, Job_Satisfaction_Score: base.Job_Satisfaction_Score },
      },
      {
        factor: 'Overtime',
        detail: emp.Overtime,
        perturbed: { ...emp, Overtime: base.Overtime },
      },
      {
        factor: 'Department',
        detail: emp.Department,
        perturbed: { ...emp, Department: base.Department },
      },
      {
        factor: 'Job Role',
        detail: emp.Job_Role,
        perturbed: { ...emp, Job_Role: base.Job_Role },
      },
      {
        factor: 'Compensation',
        detail: `₦${emp.Salary_NGN.toLocaleString('en-US')}`,
        perturbed: { ...emp, Salary_NGN: base.Salary_NGN },
      },
      {
        factor: 'Tenure',
        detail: `${emp.tenureSinceHireMonths.toFixed(0)} mo`,
        perturbed: { ...emp, Hire_Date: base.Hire_Date },
      },
    ];

    const topDrivers: FactorContribution[] = quickChecks
      .map((c) => {
        const pWithout = predictWithModelId(
          artifacts,
          modelId,
          vectorizeNormalized(c.perturbed, spec)
        );
        const impact = Number(((fullProb - pWithout) * 100).toFixed(1));
        return {
          factor: c.factor,
          detail: c.detail,
          impact,
          direction: impact >= 0 ? ('increases_risk' as const) : ('reduces_risk' as const),
        };
      })
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
      .slice(0, 3);

    return {
      ...emp,
      attritionProbability: Number(prob.toFixed(4)),
      riskClassification: classifyRisk(prob),
      topDrivers,
    };
  });
}
