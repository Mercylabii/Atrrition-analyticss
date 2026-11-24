export type RiskLevel = 'Low Risk' | 'Medium Risk' | 'High Risk';

export type ModelId = 'logistic_regression' | 'random_forest' | 'gradient_boosting';

export type NavSection =
  | 'overview'
  | 'analysis'
  | 'insights'
  | 'prediction'
  | 'reports';

export type CanonicalField =
  | 'Employee_ID'
  | 'Age'
  | 'Gender'
  | 'Department'
  | 'Job_Role'
  | 'Employment_Type'
  | 'Hire_Date'
  | 'Salary_NGN'
  | 'Performance_Rating'
  | 'Training_Hours'
  | 'Absence_Days'
  | 'Job_Satisfaction_Score'
  | 'Overtime'
  | 'Manager'
  | 'Employment_Status'
  | 'Exit_Date'
  | 'Attrition_Status';

export type ColumnMapping = Record<CanonicalField, string | null>;

export interface CleanEmployee {
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
  attritionFlag: 0 | 1;
  tenureSinceHireMonths: number;
  actualTenureMonths: number;
  ageGroup: string;
  salaryBand: string;
}

export interface ScoredEmployee extends CleanEmployee {
  attritionProbability: number;
  riskClassification: RiskLevel;
  topDrivers: FactorContribution[];
}

export interface ColumnMissingStat {
  column: string;
  missingCount: number;
  missingPct: number;
}

export interface DataQualityReport {
  rawRowCount: number;
  validRowCount: number;
  duplicatesRemoved: number;
  invalidRowsDropped: number;
  currencyEncodingFixed: number;
  statusConsistencyMismatches: number;
  exitDateAnomalies: number;
  snapshotDate: string;
  dateRange: {
    minHireDate: string;
    maxHireDate: string;
    minExitDate: string | null;
    maxExitDate: string | null;
  };
  missingByColumn: ColumnMissingStat[];
  assumptions: string[];
  validationWarnings: string[];
}

export interface ConfusionMatrix {
  tn: number;
  fp: number;
  fn: number;
  tp: number;
}

export interface RocPoint {
  fpr: number;
  tpr: number;
  threshold: number;
}

export interface FeatureImportanceItem {
  feature: string;
  label: string;
  importance: number;
}

export interface ModelEvaluation {
  modelId: ModelId;
  modelName: string;
  description: string;
  testAccuracy: number;
  testPrecision: number;
  testRecall: number;
  testF1: number;
  testRocAuc: number;
  cvRocAucMean: number;
  cvRocAucStd: number;
  cvF1Mean: number;
  cvAccuracyMean: number;
  confusionMatrix: ConfusionMatrix;
  rocCurve: RocPoint[];
  featureImportances: FeatureImportanceItem[];
  threshold: number;
}

export interface FairnessGroupMetric {
  groupType: 'Gender' | 'Age Group';
  groupName: string;
  sampleCount: number;
  actualAttritionRate: number;
  predictedPositiveRate: number;
  truePositiveRate: number | null;
  falsePositiveRate: number | null;
  suppressed: boolean;
}

export interface FairnessAuditReport {
  excludedDemographicFeatures: string[];
  genderMaxParityGap: number;
  ageMaxParityGap: number;
  groups: FairnessGroupMetric[];
  summaryNote: string;
}

export interface TrainingSummary {
  activeModelId: ModelId;
  totalSamples: number;
  trainSamples: number;
  testSamples: number;
  positiveCount: number;
  positiveRate: number;
  classImbalanceRatio: number;
  adequacyStatus: 'adequate' | 'limited' | 'insufficient';
  adequacyMessage: string;
  excludedLeakageFields: string[];
  excludedFairnessFields: string[];
  models: ModelEvaluation[];
  fairnessAudit: FairnessAuditReport;
  trainedAt: string;
}

export interface FactorContribution {
  factor: string;
  detail: string;
  impact: number; // probability delta in percentage points (-100 to +100)
  direction: 'increases_risk' | 'reduces_risk';
}

export interface PredictionInput {
  Age: number;
  Gender: string;
  Department: string;
  Job_Role: string;
  Employment_Type: string;
  Salary_NGN: number;
  Performance_Rating: number;
  Training_Hours: number;
  Absence_Days: number;
  Job_Satisfaction_Score: number;
  Overtime: 'Yes' | 'No';
  Manager: string;
  Hire_Date: string;
}

export interface PredictionResult {
  probability: number; // 0 to 1
  probabilityPct: number; // 0 to 100
  riskClassification: RiskLevel;
  modelId: ModelId;
  modelName: string;
  keyFactors: FactorContribution[];
  recommendations: string[];
  adequacyWarning: string | null;
  fairnessNote: string;
}

export interface FilterState {
  department: string;
  jobRole: string;
  employmentType: string;
  gender: string;
  manager: string;
  hireStartDate: string;
  hireEndDate: string;
}

export interface WorkspacePayload {
  employees: ScoredEmployee[];
  qualityReport: DataQualityReport;
  trainingSummary: TrainingSummary;
  options: {
    departments: string[];
    jobRoles: string[];
    rolesByDepartment: Record<string, string[]>;
    employmentTypes: string[];
    genders: string[];
    managers: string[];
    managersByDepartment: Record<string, string[]>;
  };
  isCustomDataset: boolean;
}
