export type SaraProfile = {
  saturates: number;
  aromatics: number;
  resins: number;
  asphaltenes: number;
};

export type OperationContext = {
  samplingDate: string;
  analysisDate: string;
  customerId: string;
  area: string;
  uwi: string;
  commonWell: string;
  pourPointF: number | null;
  onSiteTemperatureF: number | null;
  viscosity: number | null;
  waxDeposit: number | null;
  c20Plus: number | null; // % C20+
  operator: string;
  remarks?: string;
};

export type PredictionInput = {
  saraProfile: SaraProfile;
  context: OperationContext;
};

export type PredictionResult = {
  id: string;
  stabilityIndex: number;
  crystallizationTime: number;
  pourPoint: number;
  cacheHit: boolean;
  recommendations: string[];
  timestamp: string;
  input: PredictionInput;
};

