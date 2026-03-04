import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { PredictionInput, PredictionResult } from '@common/types';
import '@renderer/styles/App.css';
import logo from '../../assets/logo.png';
// @ts-ignore - GIF module declaration
import noxtizLogo from '../../Logo.gif';
import logo2 from '../../assets/logo2.png';
import type { ScaleResult } from '../main/backend/scaleService';
import type { ScaleCalculationResult, MineralDetail } from '../main/backend/pitzerScaleService';

// Check if preload script loaded
if (typeof window !== 'undefined') {
  console.log('[App] Checking for Sparco API...');
  console.log('[App] window.sparco:', window.sparco ? 'Available' : 'NOT AVAILABLE');
  if (!window.sparco) {
    console.error('[App] Sparco API not found! Preload script may not have loaded.');
  }
}

type FormState = PredictionInput;

const INITIAL_STATE: FormState = {
  saraProfile: {
    saturates: 0,
    aromatics: 0,
    resins: 0,
    asphaltenes: 0
  },
  context: {
    samplingDate: '2025-01-05',
    analysisDate: '2025-01-06',
    customerId: 'CUST-204',
    area: 'North Corridor',
    uwi: '00-21-045-06W5',
    commonWell: 'Well-12A',
    pourPointF: 118,
    onSiteTemperatureF: 82,
    viscosity: 420,
    waxDeposit: 3.2,
    c20Plus: null,
    operator: 'Operator-01',
    remarks: ''
  }
};

const useSaraBalance = (form: FormState) => {
  return useMemo(() => {
    const { saraProfile } = form;
    const total =
      saraProfile.saturates +
        saraProfile.aromatics +
        saraProfile.resins +
        saraProfile.asphaltenes || 1;

    return {
      saturates: Math.round((saraProfile.saturates / total) * 100),
      aromatics: Math.round((saraProfile.aromatics / total) * 100),
      resins: Math.round((saraProfile.resins / total) * 100),
      asphaltenes: Math.round((saraProfile.asphaltenes / total) * 100)
    };
  }, [form]);
};

const formatNumber = (value: number, suffix = '') =>
  Number.isFinite(value)
    ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`
    : `--${suffix}`;

const formatFixed = (value: number | null | undefined, digits = 1) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';

const formatRatioValue = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '∞';

type CongealAssessment = {
  ratio: number;
  variant: 'safe' | 'warning' | 'critical';
  headline: string;
  copy: string;
};

type CongealWarnings = {
  pourPoint?: string;
  onSite?: string;
};

const evaluateCongealMultiplier = (
  pourPointF: number | null,
  onSiteTemperatureF: number | null
): { multiplier: number; warnings: CongealWarnings } => {
  const warnings: CongealWarnings = {};

  if (pourPointF === null && onSiteTemperatureF === null) {
    warnings.pourPoint = 'Pour point tidak diisi, multiplier standar 1.2 digunakan.';
    warnings.onSite = 'On-site temperature tidak diisi, multiplier standar 1.2 digunakan.';
    return { multiplier: 1.2, warnings };
  }

  if (onSiteTemperatureF !== null && pourPointF === null) {
    const multiplier = onSiteTemperatureF > 60 ? 0.248 : 1.2;
    warnings.pourPoint = `Pour point diasumsikan 60°F untuk perhitungan (${multiplier === 0.248 ? 'multiplier 0.248' : 'multiplier 1.2'}).`;
    warnings.onSite = 'On-site temperature terisi tanpa pour point.';
    return { multiplier, warnings };
  }

  if (onSiteTemperatureF === null && pourPointF !== null) {
    warnings.onSite = 'On-site temperature diasumsikan sama dengan pour point.';
    return { multiplier: 1.2, warnings };
  }

  if (onSiteTemperatureF !== null && pourPointF !== null) {
    if (onSiteTemperatureF > pourPointF) {
      warnings.onSite = 'On-site temperature lebih tinggi dari pour point; multiplier 0.248 diterapkan.';
      return { multiplier: 0.248, warnings };
    }
    return { multiplier: 1.2, warnings };
  }

  return { multiplier: 1.2, warnings };
};

const calculateCongealRatio = (
  profile: FormState['saraProfile'],
  context: FormState['context']
) => {
  const numerator = profile.saturates + profile.asphaltenes;
  const denominator = profile.aromatics + profile.resins;
  const baseRatio =
    denominator <= 0 ? Number.POSITIVE_INFINITY : numerator / denominator;

  const { multiplier, warnings } = evaluateCongealMultiplier(
    context.pourPointF ?? null,
    context.onSiteTemperatureF ?? null
  );

  const ratio = Number.isFinite(baseRatio) ? baseRatio * multiplier : baseRatio;

  return { ratio, multiplier, warnings };
};

const getCongealAssessment = (ratio: number): CongealAssessment => {
  if (!Number.isFinite(ratio)) {
    return {
      ratio,
      variant: 'critical',
      headline: 'Congeal Index Undefined',
      copy: 'Cannot compute congeal index because aromatics + resins equals zero. Please verify the SARA inputs.'
    };
  }

  if (ratio < 0.6) {
    return {
      ratio,
      variant: 'safe',
      headline: 'Low Congealing Tendency',
      copy: 'Congeal index below 0.6 indicates a low congealing tendency and stable flow conditions.'
    };
  }
  if (ratio >= 1) {
    return {
      ratio,
      variant: 'critical',
      headline: 'High Congealing Tendency',
      copy: 'Congeal index above 1.0 signals high congealing tendency—initiate mitigation immediately.'
    };
  }
  return {
    ratio,
    variant: 'warning',
    headline: 'Moderate Congealing Tendency',
    copy: 'Congeal index between 0.6 and 1.0 indicates moderate congealing tendency. Monitor blending and process controls closely.'
  };
};

type ScalePredictionFormState = {
  sampleId: string;
  date: string;
  operator: string;
  wellName: string;
  location: string;
  field: string;
  sodium: string;
  potassium: string;
  magnesium: string;
  calcium: string;
  strontium: string;
  barium: string;
  iron: string;
  zinc: string;
  chloride: string;
  sulfate: string;
  fluoride: string;
  alkalinity: string;
  carboxylicAcids: string;
  tdsMeasured: string;
  calcDensity: string;
  co2GasAnalysis: string;
  h2sGasAnalysis: string;
  totalH2Saq: string;
  phMeasured: string;
  usePhMeasuredAt: string;
  usePhMeasuredAtStp: string;
  gasPerDay: string;
  oilPerDay: string;
  waterPerDay: string;
  initialTemperature: string;
  finalTemperature: string;
  initialPressure: string;
  finalPressure: string;
  useTpOnCalcite: string;
  apiOilGravity: string;
  gasSpecificGravity: string;
  meohPerDay: string;
  megPerDay: string;
  sio2: string;
  lead: string;
  bromide: string;
  concentrationMultiplier: string;
  qcH2sGas: string;
  qcTotalH2Saq: string;
  qcPhCalculated: string;
  qcPco2Calculated: string;
  qcAlkalinityCalculated: string;
  qcSCations: string;
  qcSAnions: string;
  qcCalcTds: string;
};

// Generate random default values for testing
const getRandomValue = (min: number, max: number, decimals = 2): string => {
  const value = Math.random() * (max - min) + min;
  return value.toFixed(decimals);
};

const INITIAL_SCALE_FORM: ScalePredictionFormState = {
  sampleId: `SAMPLE-${Math.floor(Math.random() * 10000)}`,
  date: new Date().toISOString().split('T')[0],
  operator: 'Operator-' + Math.floor(Math.random() * 100),
  wellName: 'Well-' + String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(Math.random() * 100),
  location: 'Location-' + Math.floor(Math.random() * 10),
  field: 'Field-' + Math.floor(Math.random() * 10),
  sodium: getRandomValue(5000, 15000),
  potassium: getRandomValue(100, 500),
  magnesium: getRandomValue(50, 200),
  calcium: getRandomValue(200, 500),
  strontium: getRandomValue(10, 100),
  barium: getRandomValue(0.5, 5),
  iron: getRandomValue(0.1, 2),
  zinc: getRandomValue(0, 1),
  chloride: getRandomValue(10000, 20000),
  sulfate: getRandomValue(50, 500),
  fluoride: getRandomValue(0, 5),
  alkalinity: getRandomValue(500, 3000),
  carboxylicAcids: getRandomValue(0, 500),
  tdsMeasured: getRandomValue(15000, 30000),
  calcDensity: getRandomValue(1.0, 1.05, 4),
  co2GasAnalysis: getRandomValue(0.5, 15),
  h2sGasAnalysis: getRandomValue(0, 2),
  totalH2Saq: getRandomValue(0, 50),
  phMeasured: getRandomValue(6.5, 8.5, 2),
  usePhMeasuredAt: '',
  usePhMeasuredAtStp: '1',
  gasPerDay: getRandomValue(0, 1000),
  oilPerDay: getRandomValue(0, 5000),
  waterPerDay: getRandomValue(0, 10000),
  initialTemperature: getRandomValue(180, 250),
  finalTemperature: getRandomValue(77, 200),
  initialPressure: getRandomValue(100, 500),
  finalPressure: getRandomValue(14.7, 200),
  useTpOnCalcite: '1',
  apiOilGravity: getRandomValue(30, 45),
  gasSpecificGravity: getRandomValue(0.6, 0.8, 3),
  meohPerDay: getRandomValue(0, 100),
  megPerDay: getRandomValue(0, 100),
  sio2: getRandomValue(0, 50),
  lead: getRandomValue(0, 1),
  bromide: getRandomValue(0, 10),
  concentrationMultiplier: '1',
  qcH2sGas: '',
  qcTotalH2Saq: '',
  qcPhCalculated: '',
  qcPco2Calculated: '',
  qcAlkalinityCalculated: '',
  qcSCations: '',
  qcSAnions: '',
  qcCalcTds: ''
};

type ScaleFieldConfig = {
  key: keyof ScalePredictionFormState;
  label: string;
  unit?: string;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
  requiredFor?: ('barite' | 'calcite' | 'sulfides')[]; // Field required for which mineral types
};

type ScaleFieldGroup = {
  title: string;
  description?: string;
  requiredFor?: ('barite' | 'calcite' | 'sulfides')[]; // Group required for which mineral types
  fields: ScaleFieldConfig[];
};

const SAMPLE_METADATA: ScaleFieldGroup = {
  title: 'Sample Metadata',
  description: 'Identitas dasar sampel untuk matrik ScaleSparcolabs.',
  fields: [
    { key: 'sampleId', label: 'Sample ID' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'operator', label: 'Operator' },
    { key: 'wellName', label: 'Well Name' },
    { key: 'location', label: 'Location' },
    { key: 'field', label: 'Field' }
  ]
};

const SCALE_FIELD_GROUPS: ScaleFieldGroup[] = [
  {
    title: 'Brine Chemistry',
    description: 'Masukkan ion utama dalam mg/L atau satuan sesuai catatan.',
    requiredFor: ['barite', 'calcite', 'sulfides'], // Required for all
    fields: [
      { key: 'sodium', label: 'Na⁺', unit: 'mg/L', type: 'number' },
      { key: 'potassium', label: 'K⁺', unit: 'mg/L', type: 'number' },
      { key: 'magnesium', label: 'Mg²⁺', unit: 'mg/L', type: 'number' },
      { key: 'calcium', label: 'Ca²⁺', unit: 'mg/L', type: 'number', requiredFor: ['calcite'] },
      { key: 'strontium', label: 'Sr²⁺', unit: 'mg/L', type: 'number' },
      { key: 'barium', label: 'Ba²⁺', unit: 'mg/L', type: 'number', requiredFor: ['barite'] },
      { key: 'iron', label: 'Fe²⁺', unit: 'mg/L', type: 'number', requiredFor: ['sulfides'] },
      { key: 'zinc', label: 'Zn²⁺', unit: 'mg/L', type: 'number', requiredFor: ['sulfides'] },
      { key: 'chloride', label: 'Cl⁻', unit: 'mg/L', type: 'number' },
      { key: 'sulfate', label: 'SO₄²⁻', unit: 'mg/L', type: 'number', requiredFor: ['barite'] },
      { key: 'fluoride', label: 'F⁻', unit: 'mg/L', type: 'number' },
      { key: 'alkalinity', label: 'Alkalinity**', unit: 'mg/L', type: 'number', requiredFor: ['calcite'] },
      { key: 'carboxylicAcids', label: 'Carboxylic acids**', unit: 'mg/L', type: 'number' },
      { key: 'tdsMeasured', label: 'TDS (Measured)', unit: 'mg/L', type: 'number' },
      { key: 'calcDensity', label: 'Calc. Density (STP)', unit: 'g/mL', type: 'number' }
    ]
  },
  {
    title: 'Gas & Acidity Profile',
    description: 'Komponen gas dan pengaturan pH.',
    requiredFor: ['calcite', 'sulfides'],
    fields: [
      { key: 'co2GasAnalysis', label: 'CO₂ Gas Analysis', unit: '%', type: 'number', requiredFor: ['calcite'] },
      { key: 'h2sGasAnalysis', label: 'H₂S Gas Analysis***', unit: '%', type: 'number', requiredFor: ['sulfides'] },
      { key: 'totalH2Saq', label: 'Total H₂Saq', unit: 'mg H₂S/L', type: 'number', requiredFor: ['sulfides'] },
      { key: 'phMeasured', label: 'pH, measured (STP)', type: 'number', requiredFor: ['calcite'] },
      { key: 'usePhMeasuredAt', label: 'Use pH measured at' },
      { key: 'usePhMeasuredAtStp', label: 'STP to calculate SI?', placeholder: '1=Yes, 0=No', type: 'number' }
    ]
  },
  {
    title: 'Production Rates',
    description: 'Rate produksi fluida, gunakan 0 bila tidak ada.',
    fields: [
      { key: 'gasPerDay', label: 'Gas/day', unit: 'Mcf/D', type: 'number' },
      { key: 'oilPerDay', label: 'Oil/Day', unit: 'B/D', type: 'number' },
      { key: 'waterPerDay', label: 'Water/Day', unit: 'B/D', type: 'number' }
    ]
  },
  {
    title: 'Operating Conditions',
    description: 'Temperatur dan tekanan inlet/outlet.',
    requiredFor: ['barite', 'calcite', 'sulfides'], // Required for all
    fields: [
      { key: 'initialTemperature', label: 'Initial T (BH)', unit: '°F', type: 'number' },
      { key: 'finalTemperature', label: 'Final T (WH)', unit: '°F', type: 'number' },
      { key: 'initialPressure', label: 'Initial P (BH)', unit: 'psia', type: 'number' },
      { key: 'finalPressure', label: 'Final P (WH)', unit: 'psia', type: 'number' },
      { key: 'useTpOnCalcite', label: 'Use TP on Calcite sheet?', placeholder: '1=Yes, 0=No', type: 'number' }
    ]
  },
  {
    title: 'Fluid Properties & Inhibitors',
    fields: [
      { key: 'apiOilGravity', label: 'API Oil Grav.', unit: 'API', type: 'number' },
      { key: 'gasSpecificGravity', label: 'Gas Sp.Grav.', type: 'number' },
      { key: 'meohPerDay', label: 'MeOH/Day', unit: 'B/D', type: 'number' },
      { key: 'megPerDay', label: 'MEG/Day', unit: 'B/D', type: 'number' },
      { key: 'sio2', label: 'SiO₂', unit: 'mg/L', type: 'number' },
      { key: 'lead', label: 'Pb²⁺', unit: 'mg/L', type: 'number' },
      { key: 'bromide', label: 'Br⁻', unit: 'mg/L', type: 'number' },
      { key: 'concentrationMultiplier', label: 'Conc. Multiplier', type: 'number' }
    ]
  },
  {
    title: 'Quality Control Checks at STP',
    description: 'Bidang QC manual untuk validasi perhitungan.',
    fields: [
      { key: 'qcH2sGas', label: 'H₂S Gas', unit: '%', type: 'number' },
      { key: 'qcTotalH2Saq', label: 'Total H₂Saq (STP)', unit: 'mg H₂S/L', type: 'number' },
      { key: 'qcPhCalculated', label: 'pH Calculated', type: 'number' },
      { key: 'qcPco2Calculated', label: 'PCO₂ Calculated', unit: '%', type: 'number' },
      { key: 'qcAlkalinityCalculated', label: 'Alkalinity Calculated', unit: 'mg/L as HCO₃', type: 'number' },
      { key: 'qcSCations', label: 'ΣCations', unit: 'equiv./L', type: 'number' },
      { key: 'qcSAnions', label: 'ΣAnions', unit: 'equiv./L', type: 'number' },
      { key: 'qcCalcTds', label: 'Calc TDS', unit: 'mg/L', type: 'number' }
    ]
  }
];

const REPORT_PDF_STYLES = `
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: 'Segoe UI', 'Roboto', 'Inter', sans-serif;
  background: #ffffff;
  color: #1a1a1a;
  line-height: 1.6;
}
.report-document {
  padding: 48px 60px;
  max-width: 210mm;
  margin: 0 auto;
}
.report-header {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 3px solid #3f5aff;
}
.report-logo img {
  width: 120px;
  height: auto;
}
.report-title h1 {
  margin: 0 0 8px;
  font-size: 2rem;
  font-weight: 700;
}
.report-subtitle {
  margin: 0;
  font-size: 0.95rem;
  color: #555;
}
.report-meta {
  margin-bottom: 32px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}
.report-meta-row {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 8px;
  font-size: 0.95rem;
}
.report-meta-row:last-child {
  margin-bottom: 0;
}
.report-meta-row strong {
  color: #3f5aff;
}
.report-section {
  margin-bottom: 40px;
}
.report-section h2 {
  font-size: 1.5rem;
  margin: 0 0 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e0e6ed;
}
.report-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin-bottom: 24px;
}
.report-card {
  background: #f9fafb;
  border: 1px solid #e0e6ed;
  border-radius: 8px;
  padding: 20px;
}
.report-card h3 {
  margin: 0 0 16px;
  font-size: 1.1rem;
  color: #3f5aff;
}
.report-table {
  width: 100%;
  border-collapse: collapse;
}
.report-table thead {
  background: #3f5aff;
  color: #ffffff;
}
.report-table th {
  padding: 12px;
  text-align: left;
  font-size: 0.9rem;
}
.report-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e0e6ed;
  font-size: 0.9rem;
}
.report-notes {
  margin-top: 24px;
  padding: 16px;
  background: #fff9e6;
  border-left: 4px solid #ffc107;
  border-radius: 4px;
  color: #856404;
}
.report-metric {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #ffffff;
  padding: 24px;
  border-radius: 12px;
  text-align: center;
}
.report-metric h3 {
  margin: 0 0 12px;
  font-size: 1rem;
  opacity: 0.85;
}
.report-metric-value {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 12px 0;
}
.report-metric p {
  margin: 12px 0 0;
  font-size: 0.85rem;
  opacity: 0.8;
}
.report-congeal-section {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 32px;
  align-items: start;
}
.report-congeal-status {
  background: #f9fafb;
  padding: 24px;
  border-radius: 8px;
  border-left: 4px solid #ff789c;
}
.report-congeal-status h3 {
  margin: 0 0 12px;
  font-size: 1.2rem;
}
.report-congeal-status p {
  margin: 0 0 16px;
  color: #666;
}
.report-congeal-value {
  font-size: 1.1rem;
  color: #1a1a1a;
}
.report-congeal-value strong {
  color: #3f5aff;
  font-size: 1.3rem;
}
.report-congeal-chart {
  display: flex;
  align-items: center;
  gap: 16px;
}
.report-congeal-axis {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 200px;
  font-size: 0.75rem;
  color: #666;
}
.report-congeal-track {
  position: relative;
  width: 24px;
  height: 200px;
  border-radius: 999px;
  background: linear-gradient(
    to top,
    #258c5a 0%,
    #258c5a 7%,
    #bd9337 7%,
    #bd9337 11%,
    #a8304c 11%,
    #a8304c 100%
  );
  border: 1px solid #e0e6ed;
}
.report-congeal-pointer {
  position: absolute;
  left: 50%;
  transform: translate(-50%, 50%);
}
.report-congeal-knob {
  position: absolute;
  left: -8px;
  top: -8px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffffff, #81ceff);
  border: 2px solid #070e2a;
  box-shadow: 0 0 12px rgba(129, 206, 255, 0.6);
}
.report-congeal-guide {
  position: absolute;
  left: 8px;
  top: 0;
  width: 200px;
  border-top: 2px dashed rgba(129, 206, 255, 0.6);
}
.report-congeal-tooltip {
  position: absolute;
  top: -12px;
  left: 24px;
  white-space: nowrap;
  padding: 4px 10px;
  border-radius: 4px;
  background: rgba(18, 30, 72, 0.95);
  color: #d1e1ff;
  font-size: 0.75rem;
  font-weight: 600;
}
.report-recommendations {
  list-style: none;
  padding: 0;
  margin: 0;
}
.report-recommendations li {
  padding: 12px 16px;
  margin-bottom: 8px;
  background: #f5f7fa;
  border-left: 4px solid #3f5aff;
  border-radius: 4px;
  color: #1a1a1a;
}
.report-recommendations li:last-child {
  margin-bottom: 0;
}
.report-footer {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 2px solid #e0e6ed;
  text-align: center;
  color: #666;
  font-size: 0.85rem;
}
.report-footer-logos {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
}
.report-footer-logos .footer-logo {
  height: 40px;
  width: auto;
  object-fit: contain;
}
.report-footer-meta {
  margin-top: 12px;
  font-size: 0.75rem;
  color: #999;
}
.report-footer-copyright {
  margin-top: 16px;
  font-size: 0.8rem;
  color: #666;
}
.report-footer-copyright a {
  color: #4c78ff;
  text-decoration: none;
}
.report-footer-copyright a:hover {
  text-decoration: underline;
}
`;

type ReportPreviewProps = {
  result: PredictionResult;
  resultCongeal: CongealAssessment | null;
  resultCongealPointer: number | null;
  onClose: () => void;
  onSavePDF: () => Promise<void>;
  savingPDF: boolean;
  reportRef: RefObject<HTMLDivElement | null>;
};

type ScaleReportPreviewProps = {
  scaleResult: ScaleCalculationResult;
  scaleForm: ScalePredictionFormState;
  selectedMineralType: 'barite' | 'calcite' | 'sulfides';
  onClose: () => void;
  onSavePDF: () => Promise<void>;
  savingPDF: boolean;
  reportRef: RefObject<HTMLDivElement | null>;
};

const ReportPreview = ({
  result,
  resultCongeal,
  resultCongealPointer,
  onClose,
  onSavePDF,
  savingPDF,
  reportRef
}: ReportPreviewProps) => {
  const { input } = result;
  const reportDate = new Date(result.timestamp);

  return (
    <div className="report-modal-overlay" onClick={onClose}>
      <div className="report-modal" onClick={(e) => e.stopPropagation()}>
        <div className="report-modal-header">
          <h2>Report Preview</h2>
          <button className="report-close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="report-modal-content">
          <div ref={reportRef} className="report-document">
            <header className="report-header">
              <div className="report-logo">
                <img src={logo} alt="Sparco Labs" />
              </div>
              <div className="report-title">
                <h1>Congeal Prediction Report</h1>
                <p className="report-subtitle">Comprehensive Analysis & Recommendations</p>
              </div>
            </header>

            <section className="report-meta">
              <div className="report-meta-row">
                <div>
                  <strong>Report ID:</strong> {result.id}
                </div>
                <div>
                  <strong>Generated:</strong> {reportDate.toLocaleString()}
                </div>
              </div>
              <div className="report-meta-row">
                <div>
                  <strong>Sampling Date:</strong> {input.context.samplingDate || '—'}
                </div>
                <div>
                  <strong>Analysis Date:</strong> {input.context.analysisDate || '—'}
                </div>
              </div>
              <div className="report-meta-row">
                <div>
                  <strong>Customer ID:</strong> {input.context.customerId || '—'}
                </div>
                <div>
                  <strong>Operator:</strong> {input.context.operator || '—'}
                </div>
              </div>
            </section>

            <section className="report-section">
              <h2>Input Data</h2>
              <div className="report-grid">
                <div className="report-card">
                  <h3>SARA Profile</h3>
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Component</th>
                        <th>Value (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Saturates</td>
                        <td>{formatNumber(input.saraProfile.saturates)}</td>
                      </tr>
                      <tr>
                        <td>Aromatics</td>
                        <td>{formatNumber(input.saraProfile.aromatics)}</td>
                      </tr>
                      <tr>
                        <td>Resins</td>
                        <td>{formatNumber(input.saraProfile.resins)}</td>
                      </tr>
                      <tr>
                        <td>Asphaltenes</td>
                        <td>{formatNumber(input.saraProfile.asphaltenes)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="report-card">
                  <h3>Sample Context</h3>
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Parameter</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Area</td>
                        <td>{input.context.area || '—'}</td>
                      </tr>
                      <tr>
                        <td>UWI</td>
                        <td>{input.context.uwi || '—'}</td>
                      </tr>
                      <tr>
                        <td>Common Well</td>
                        <td>{input.context.commonWell || '—'}</td>
                      </tr>
                      <tr>
                        <td>Pour Point Temp</td>
                        <td>{formatNumber(Number(input.context.pourPointF ?? NaN), ' °F')}</td>
                      </tr>
                      <tr>
                        <td>On Site Temp</td>
                        <td>{formatNumber(Number(input.context.onSiteTemperatureF ?? NaN), ' °F')}</td>
                      </tr>
                      <tr>
                        <td>Viscosity</td>
                        <td>{formatNumber(Number(input.context.viscosity ?? NaN), ' cP')}</td>
                      </tr>
                      <tr>
                        <td>Wax Deposit</td>
                        <td>{formatNumber(Number(input.context.waxDeposit ?? NaN), ' %')}</td>
                      </tr>
                      <tr>
                        <td>% C20+</td>
                        <td>{formatNumber(Number(input.context.c20Plus ?? NaN), ' %')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              {input.context.remarks && (
                <div className="report-notes">
                  <h3>Remarks</h3>
                  <p>{input.context.remarks}</p>
                </div>
              )}
            </section>

            <section className="report-section">
              <h2>Prediction Results</h2>
              <div className="report-grid">
                <div className="report-metric">
                  <h3>Stability Index</h3>
                  <div className="report-metric-value">{formatNumber(result.stabilityIndex)}</div>
                  <p>Score from 0-100 indicating crystal structure stability</p>
                </div>
                <div className="report-metric">
                  <h3>Crystallization Time</h3>
                  <div className="report-metric-value">
                    {formatNumber(result.crystallizationTime, ' hrs')}
                  </div>
                  <p>Estimated duration until oil solidifies into a stable congeal state</p>
                </div>
                <div className="report-metric">
                  <h3>Pour Point</h3>
                  <div className="report-metric-value">{formatNumber(result.pourPoint, ' °C')}</div>
                  <p>Critical temperature where the flow becomes sluggish</p>
                </div>
              </div>
            </section>

            {resultCongeal && resultCongealPointer !== null && (
              <section className="report-section">
                <h2>Congeal Threshold Analysis</h2>
                <div className="report-congeal-section">
                  <div className="report-congeal-status">
                    <h3>Status: {resultCongeal.headline}</h3>
                    <p>{resultCongeal.copy}</p>
                    <div className="report-congeal-value">
                      Congeal Index: <strong>{formatNumber(resultCongeal.ratio)}</strong>
                    </div>
                  </div>
                  <div className="report-congeal-chart-container">
                    <div className="report-congeal-chart">
                      <ul className="report-congeal-axis">
                        {['100%', '75%', '50%', '25%', '11%', '7%', '0%'].map((tick) => (
                          <li key={tick}>{tick}</li>
                        ))}
                      </ul>
                      <div className="report-congeal-track">
                        <div
                          className="report-congeal-pointer"
                          style={{ bottom: `${resultCongealPointer}%` }}
                        >
                          <div className="report-congeal-knob" />
                          <div className="report-congeal-guide" />
                          <span className="report-congeal-tooltip">
                            {formatNumber(resultCongeal.ratio)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="report-section">
              <h2>Lab Recommendations</h2>
              <ul className="report-recommendations">
                {result.recommendations.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </section>

            <footer className="report-footer">
              <p>
                This report was generated by Sparco Labs Congeal Prediction System. For questions
                or support, please contact your system administrator.
              </p>
              <p className="report-footer-meta">
                Cache Status: {result.cacheHit ? 'Retrieved from cache' : 'New calculation'} •{' '}
                Report Version 1.0
              </p>
            </footer>
          </div>
        </div>
        <div className="report-modal-footer">
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
          <button className="primary-button" onClick={onSavePDF} disabled={savingPDF}>
            {savingPDF ? 'Saving...' : 'Save to PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ScaleReportPreview = ({
  scaleResult,
  scaleForm,
  selectedMineralType,
  onClose,
  onSavePDF,
  savingPDF,
  reportRef
}: ScaleReportPreviewProps) => {
  const reportDate = new Date().toLocaleString();
  const mineralTypeName = selectedMineralType.charAt(0).toUpperCase() + selectedMineralType.slice(1);

  return (
    <div className="report-modal-overlay" onClick={onClose}>
      <div className="report-modal" onClick={(e) => e.stopPropagation()}>
        <div className="report-modal-header">
          <h2>Scale Prediction Report Preview</h2>
          <button className="report-close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="report-modal-content">
          <div ref={reportRef} className="report-document">
            <header className="report-header">
              <div className="report-logo">
                <img src={logo} alt="Sparco Labs" />
              </div>
              <div className="report-title">
                <h1>{mineralTypeName} Scale Prediction Report</h1>
                <p className="report-subtitle">Pitzer-based Scale Prediction Analysis</p>
              </div>
            </header>

            <section className="report-meta">
              <div className="report-meta-row">
                <div>
                  <strong>Sample ID:</strong> {scaleForm.sampleId || '—'}
                </div>
                <div>
                  <strong>Generated:</strong> {reportDate}
                </div>
              </div>
              <div className="report-meta-row">
                <div>
                  <strong>Date:</strong> {scaleForm.date || '—'}
                </div>
                <div>
                  <strong>Operator:</strong> {scaleForm.operator || '—'}
                </div>
              </div>
              <div className="report-meta-row">
                <div>
                  <strong>Well Name:</strong> {scaleForm.wellName || '—'}
                </div>
                <div>
                  <strong>Location:</strong> {scaleForm.location || '—'}
                </div>
              </div>
              <div className="report-meta-row">
                <div>
                  <strong>Field:</strong> {scaleForm.field || '—'}
                </div>
                <div>
                  <strong>Mineral Type:</strong> {mineralTypeName}
                </div>
              </div>
            </section>

            <section className="report-section">
              <h2>Calculation Results</h2>
              <div className="report-grid">
                <div className="report-card">
                  <h3>Saturation Index</h3>
                  <table className="report-table">
                    <tbody>
                      <tr>
                        <td>SI at WH</td>
                        <td><strong>{Number.isFinite(scaleResult.saturationIndex) ? scaleResult.saturationIndex.toFixed(4) : 'N/A'}</strong></td>
                      </tr>
                      <tr>
                        <td>Delta SI (WH - BH)</td>
                        <td><strong>{Number.isFinite(scaleResult.deltaSI) ? scaleResult.deltaSI.toFixed(4) : 'N/A'}</strong></td>
                      </tr>
                      <tr>
                        <td>Amount to Precipitate</td>
                        <td><strong>{Number.isFinite(scaleResult.amountToPrecipitate) ? `${scaleResult.amountToPrecipitate.toFixed(2)} mg/L` : 'N/A'}</strong></td>
                      </tr>
                      <tr>
                        <td>Status</td>
                        <td><strong>{scaleResult.status}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="report-card">
                  <h3>Operating Conditions</h3>
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Parameter</th>
                        <th>BH</th>
                        <th>WH</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Temperature</td>
                        <td>{scaleResult.calculations.bh.temperature.toFixed(1)} °F</td>
                        <td>{scaleResult.calculations.wh.temperature.toFixed(1)} °F</td>
                      </tr>
                      <tr>
                        <td>Pressure</td>
                        <td>{scaleResult.calculations.bh.pressure.toFixed(1)} psia</td>
                        <td>{scaleResult.calculations.wh.pressure.toFixed(1)} psia</td>
                      </tr>
                      <tr>
                        <td>Saturation Index</td>
                        <td>{scaleResult.calculations.bh.si.toFixed(4)}</td>
                        <td>{scaleResult.calculations.wh.si.toFixed(4)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {scaleResult.mineralDetails && scaleResult.mineralDetails.length > 0 && (
              <section className="report-section">
                <h2>Mineral Breakdown</h2>
                <div className="report-card">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Mineral</th>
                        <th>SI (BH)</th>
                        <th>SI (WH)</th>
                        <th>Delta SI</th>
                        {selectedMineralType === 'sulfides' && <th>Amount (mg/L)</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {scaleResult.mineralDetails.map((mineral: MineralDetail, idx: number) => (
                        <tr key={idx}>
                          <td><strong>{mineral.name}</strong></td>
                          <td>{Number.isFinite(mineral.siBH) ? mineral.siBH.toFixed(4) : 'N/A'}</td>
                          <td>{Number.isFinite(mineral.siWH) ? mineral.siWH.toFixed(4) : 'N/A'}</td>
                          <td>{Number.isFinite(mineral.deltaSI) ? mineral.deltaSI.toFixed(4) : 'N/A'}</td>
                          {selectedMineralType === 'sulfides' && (
                            <td>{Number.isFinite(mineral.amountToPrecipitate) ? mineral.amountToPrecipitate.toFixed(2) : '0.00'}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="report-section">
              <h2>Input Data</h2>
              <div className="report-grid">
                <div className="report-card">
                  <h3>Brine Chemistry</h3>
                  <table className="report-table">
                    <tbody>
                      <tr><td>Na⁺</td><td>{formatNumber(parseFloat(scaleForm.sodium || '0'), ' mg/L')}</td></tr>
                      <tr><td>K⁺</td><td>{formatNumber(parseFloat(scaleForm.potassium || '0'), ' mg/L')}</td></tr>
                      <tr><td>Mg²⁺</td><td>{formatNumber(parseFloat(scaleForm.magnesium || '0'), ' mg/L')}</td></tr>
                      <tr><td>Ca²⁺</td><td>{formatNumber(parseFloat(scaleForm.calcium || '0'), ' mg/L')}</td></tr>
                      <tr><td>Sr²⁺</td><td>{formatNumber(parseFloat(scaleForm.strontium || '0'), ' mg/L')}</td></tr>
                      <tr><td>Ba²⁺</td><td>{formatNumber(parseFloat(scaleForm.barium || '0'), ' mg/L')}</td></tr>
                      {selectedMineralType === 'sulfides' && (
                        <>
                          <tr><td>Fe²⁺</td><td>{formatNumber(parseFloat(scaleForm.iron || '0'), ' mg/L')}</td></tr>
                          <tr><td>Zn²⁺</td><td>{formatNumber(parseFloat(scaleForm.zinc || '0'), ' mg/L')}</td></tr>
                          {scaleForm.lead && <tr><td>Pb²⁺</td><td>{formatNumber(parseFloat(scaleForm.lead || '0'), ' mg/L')}</td></tr>}
                        </>
                      )}
                      <tr><td>Cl⁻</td><td>{formatNumber(parseFloat(scaleForm.chloride || '0'), ' mg/L')}</td></tr>
                      <tr><td>SO₄²⁻</td><td>{formatNumber(parseFloat(scaleForm.sulfate || '0'), ' mg/L')}</td></tr>
                      {scaleForm.fluoride && <tr><td>F⁻</td><td>{formatNumber(parseFloat(scaleForm.fluoride || '0'), ' mg/L')}</td></tr>}
                      <tr><td>Alkalinity</td><td>{formatNumber(parseFloat(scaleForm.alkalinity || '0'), ' mg/L')}</td></tr>
                    </tbody>
                  </table>
                </div>
                {(selectedMineralType === 'calcite' || selectedMineralType === 'sulfides') && (
                  <div className="report-card">
                    <h3>Gas & Acidity Profile</h3>
                    <table className="report-table">
                      <tbody>
                        {scaleForm.co2GasAnalysis && <tr><td>CO₂ Gas Analysis</td><td>{formatNumber(parseFloat(scaleForm.co2GasAnalysis || '0'), ' %')}</td></tr>}
                        {scaleForm.h2sGasAnalysis && <tr><td>H₂S Gas Analysis</td><td>{formatNumber(parseFloat(scaleForm.h2sGasAnalysis || '0'), ' %')}</td></tr>}
                        {scaleForm.totalH2Saq && <tr><td>Total H₂Saq</td><td>{formatNumber(parseFloat(scaleForm.totalH2Saq || '0'), ' mg H₂S/L')}</td></tr>}
                        {scaleForm.phMeasured && <tr><td>pH (measured)</td><td>{formatNumber(parseFloat(scaleForm.phMeasured || '0'))}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <footer className="report-footer">
              <p>
                This report was generated by Sparco Labs Scale Prediction System. For questions
                or support, please contact your system administrator.
              </p>
              <p className="report-footer-meta">
                Report Version 1.0 • Based on ScaleSoftPitzer Pitzer Model
              </p>
            </footer>
          </div>
        </div>
        <div className="report-modal-footer">
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
          <button className="primary-button" onClick={onSavePDF} disabled={savingPDF}>
            {savingPDF ? 'Saving...' : 'Save to PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [history, setHistory] = useState<PredictionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<'dashboard' | 'scale'>('dashboard');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [scaleForm, setScaleForm] = useState<ScalePredictionFormState>(INITIAL_SCALE_FORM);
  const [scaleResult, setScaleResult] = useState<ScaleCalculationResult | null>(null);
  const [scaleStatus, setScaleStatus] = useState<string | null>(null);
  const [scaleLoading, setScaleLoading] = useState(false);
  const [openScalePanel, setOpenScalePanel] = useState<string>('Brine Chemistry');
  const [selectedMineralType, setSelectedMineralType] = useState<'barite' | 'calcite' | 'sulfides'>('barite');

  // Auto-switch to first available panel when mineral type changes
  useEffect(() => {
    const filteredGroups = SCALE_FIELD_GROUPS.filter((group) => {
      if (!group.requiredFor) return true;
      return group.requiredFor.includes(selectedMineralType);
    });
    if (filteredGroups.length > 0 && !filteredGroups.find((g) => g.title === openScalePanel)) {
      setOpenScalePanel(filteredGroups[0].title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMineralType]);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [savingPDF, setSavingPDF] = useState(false);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [showScaleReportPreview, setShowScaleReportPreview] = useState(false);
  const [savingScalePDF, setSavingScalePDF] = useState(false);
  const scaleReportRef = useRef<HTMLDivElement | null>(null);
  const navigateTimeoutRef = useRef<number | null>(null);
  const finishingTimeoutRef = useRef<number | null>(null);

  const saraBalance = useSaraBalance(form);
  const saraTotal = useMemo(
    () =>
      form.saraProfile.saturates +
      form.saraProfile.aromatics +
      form.saraProfile.resins +
      form.saraProfile.asphaltenes,
    [form.saraProfile]
  );
  const { ratio: congealRatio, warnings: congealWarnings } = useMemo(
    () => calculateCongealRatio(form.saraProfile, form.context),
    [form.saraProfile, form.context]
  );
  const congealAssessment = useMemo(() => getCongealAssessment(congealRatio), [congealRatio]);
  const ratioToPosition = (value: number) => {
    if (!Number.isFinite(value)) {
      return 100;
    }
    const maxRatio = 1.5;
    return Math.max(0, Math.min(100, (value / maxRatio) * 100));
  };
  const congealPointerPosition = ratioToPosition(congealAssessment.ratio);
  const resultCongeal = useMemo(() => {
    if (!result) {
      return null;
    }
    const { ratio } = calculateCongealRatio(result.input.saraProfile, result.input.context);
    return getCongealAssessment(ratio);
  }, [result]);
  const resultCongealPointer = resultCongeal
    ? ratioToPosition(resultCongeal.ratio)
    : null;

  // Convert image to base64 for PDF
  const convertImageToBase64 = (imgElement: HTMLImageElement): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!imgElement.complete) {
        imgElement.onload = () => convertImageToBase64(imgElement).then(resolve).catch(reject);
        imgElement.onerror = reject;
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      canvas.width = imgElement.naturalWidth;
      canvas.height = imgElement.naturalHeight;
      ctx.drawImage(imgElement, 0, 0);
      
      try {
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      }
    });
  };

  const buildReportHtml = async () => {
    if (!reportRef.current) {
      return null;
    }

    // Get images from original element (they're already loaded)
    const originalImages = Array.from(reportRef.current.querySelectorAll('img')) as HTMLImageElement[];
    const base64Images: string[] = [];
    
    // Convert all images to base64 from original elements
    for (const img of originalImages) {
      if (img.complete && img.naturalWidth > 0) {
        try {
          const base64 = await convertImageToBase64(img);
          base64Images.push(base64);
        } catch (error) {
          console.warn('Failed to convert image to base64:', error);
          base64Images.push(img.src); // Fallback to original src
        }
      } else {
        // Image not loaded yet, use original src
        base64Images.push(img.src);
      }
    }

    // Clone the content to avoid modifying the original
    const clonedContent = reportRef.current.cloneNode(true) as HTMLElement;
    
    // Replace image srcs with base64 (match by index)
    const clonedImages = Array.from(clonedContent.querySelectorAll('img')) as HTMLImageElement[];
    clonedImages.forEach((img, index) => {
      if (index < base64Images.length) {
        img.src = base64Images[index];
      }
    });

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Sparco Congeal Report</title>
    <style>${REPORT_PDF_STYLES}</style>
  </head>
  <body>
    ${clonedContent.outerHTML}
  </body>
</html>`;
  };

  const buildScaleReportHtml = async () => {
    if (!scaleReportRef.current) {
      return null;
    }

    // Get images from original element (they're already loaded)
    const originalImages = Array.from(scaleReportRef.current.querySelectorAll('img')) as HTMLImageElement[];
    const base64Images: string[] = [];
    
    // Convert all images to base64 from original elements
    for (const img of originalImages) {
      if (img.complete && img.naturalWidth > 0) {
        try {
          const base64 = await convertImageToBase64(img);
          base64Images.push(base64);
        } catch (error) {
          console.warn('Failed to convert image to base64:', error);
          base64Images.push(img.src); // Fallback to original src
        }
      } else {
        // Image not loaded yet, use original src
        base64Images.push(img.src);
      }
    }

    // Clone the content to avoid modifying the original
    const clonedContent = scaleReportRef.current.cloneNode(true) as HTMLElement;
    
    // Replace image srcs with base64 (match by index)
    const clonedImages = Array.from(clonedContent.querySelectorAll('img')) as HTMLImageElement[];
    clonedImages.forEach((img, index) => {
      if (index < base64Images.length) {
        img.src = base64Images[index];
      }
    });

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Sparco Scale Prediction Report</title>
    <style>${REPORT_PDF_STYLES}</style>
  </head>
  <body>
    ${clonedContent.outerHTML}
  </body>
</html>`;
  };

  useEffect(() => {
    let active = true;
    
    if (!window.sparco) {
      console.error('Sparco API not available - preload script may not have loaded');
      setStatus('Error: Sparco API not available. Please reload the application.');
      return;
    }
    
    window.sparco
      .getHistory()
      .then((payload) => {
        if (active) {
          setHistory(payload);
        }
      })
      .catch((error) => setStatus(`Failed to load history: ${error.message}`));

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (navigateTimeoutRef.current) {
        window.clearTimeout(navigateTimeoutRef.current);
      }
      if (finishingTimeoutRef.current) {
        window.clearTimeout(finishingTimeoutRef.current);
      }
    };
  }, []);

  const updateSara = (field: keyof FormState['saraProfile'], value: number) => {
    setForm((prev) => {
      const nextValue = Number.isFinite(value) ? value : 0;
      const nextProfile = {
        ...prev.saraProfile,
        [field]: nextValue
      };
      const total = Object.values(nextProfile).reduce((sum, current) => sum + current, 0);
      if (total > 100.0001) {
        window.alert('Total SARA tidak boleh lebih dari 100%.');
        return prev;
      }
      return {
        ...prev,
        saraProfile: nextProfile
      };
    });
  };

  const updateContext = (field: keyof FormState['context'], value: string | number | null) => {
    setForm((prev) => ({
      ...prev,
      context: {
        ...prev.context,
        [field]: value
      }
    }));
  };

  const dotChartPoints = useMemo(() => {
    if (!result) {
      return [];
    }

    const normalize = (value: number, min: number, max: number) => {
      const clamped = Math.max(min, Math.min(max, value));
      return ((clamped - min) / (max - min)) * 100;
    };

    const points = [
      {
        label: 'Stability',
        valueLabel: formatNumber(result.stabilityIndex),
        position: normalize(result.stabilityIndex, 0, 100),
        variant:
          result.stabilityIndex < 45 ? 'critical' : result.stabilityIndex > 75 ? 'safe' : 'warning',
        scaleLabel: '0 — 100'
      },
      {
        label: 'Crystallization',
        valueLabel: `${formatNumber(result.crystallizationTime)} hrs`,
        position: normalize(result.crystallizationTime, 0, 24),
        variant:
          result.crystallizationTime > 14
            ? 'warning'
            : result.crystallizationTime < 6
              ? 'critical'
              : 'safe',
        scaleLabel: '0 — 24 hrs'
      },
      {
        label: 'Pour Point',
        valueLabel: `${formatNumber(result.pourPoint)} °C`,
        position: normalize(result.pourPoint, -45, 35),
        variant:
          result.pourPoint > 15 ? 'critical' : result.pourPoint < -20 ? 'safe' : 'warning',
        scaleLabel: '-45 — 35 °C'
      },
      {
        label: 'Asphaltenes',
        valueLabel: `${formatNumber(result.input.saraProfile.asphaltenes)} %`,
        position: normalize(result.input.saraProfile.asphaltenes, 0, 20),
        variant:
          result.input.saraProfile.asphaltenes < 7
            ? 'safe'
            : result.input.saraProfile.asphaltenes > 11
              ? 'critical'
              : 'warning',
        scaleLabel: '0 — 20 %'
      },
      (() => {
        const { ratio } = calculateCongealRatio(result.input.saraProfile, result.input.context);
        return {
          label: 'Congeal Ratio',
          valueLabel: formatRatioValue(ratio),
          position: Number.isFinite(ratio) ? normalize(ratio, 0, 1.5) : 100,
          variant: !Number.isFinite(ratio)
            ? 'critical'
            : ratio >= 1
              ? 'critical'
              : ratio >= 0.6
                ? 'warning'
                : 'safe',
          scaleLabel: '0 — 1.5'
        };
      })()
    ];

    return points;
  }, [result]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (!window.sparco) {
      setStatus('Error: Sparco API not available. Please reload the application.');
      return;
    }
    
    setLoading(true);
    setStatus('Running SARA-driven congeal prediction...');

    try {
      const payload: PredictionInput = form;
      const prediction = await window.sparco.runPrediction(payload);
      setResult(prediction);
      setHistory((prev) => [prediction, ...prev.filter((item) => item.id !== prediction.id)]);
      setStatus(prediction.cacheHit ? 'Served from local cache 💾' : 'Fresh simulation complete 🚀');
    } catch (error) {
      console.error(error);
      setStatus('Prediction failed. Double-check the input fields.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    if (!window.sparco) {
      setStatus('Error: Sparco API not available. Please reload the application.');
      return;
    }
    
    try {
      await window.sparco.clearCache();
      setStatus('Local cache cleared.');
    } catch (error) {
      setStatus(`Failed to clear cache: ${(error as Error).message}`);
    }
  };

  const handleNavigate = (page: 'dashboard' | 'scale') => {
    if (page === activePage || isTransitioning) {
      return;
    }

    setIsTransitioning(true);

    if (navigateTimeoutRef.current) {
      window.clearTimeout(navigateTimeoutRef.current);
    }
    if (finishingTimeoutRef.current) {
      window.clearTimeout(finishingTimeoutRef.current);
    }

    navigateTimeoutRef.current = window.setTimeout(() => {
      setActivePage(page);
    }, 360);

    finishingTimeoutRef.current = window.setTimeout(() => {
      setIsTransitioning(false);
    }, 900);
  };

  const updateScaleField = (field: keyof ScalePredictionFormState, value: string) => {
    setScaleForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const renderDashboard = () => (
    <>
      <section className="hero">
        <div>
          <h2>Congeal Prediction Matrix</h2>
          <p>
            Simulation cockpit for your congeal oil. Enter the SARA profile and operating
            conditions, and Sparco Labs will map stability plus recommendations like a futuristic lab
            assistant.
          </p>
        </div>
        <div className={`status-badge ${loading ? 'pulsing' : ''}`}>
          {loading ? 'Running...' : status ?? 'Ready.'}
        </div>
      </section>

      <form className="labs-form" onSubmit={handleSubmit}>
        <section className="card-grid">
          <div className="card futuristic">
            <header>
              <h3>SARA Profile (%)</h3>
              <span>Fraction composition of your sample</span>
            </header>
            <div className="field-grid">
              {(['saturates', 'aromatics', 'resins', 'asphaltenes'] as const).map((key) => (
                <label key={key} className="field">
                  <span>{key.toUpperCase()}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    inputMode="decimal"
                    value={form.saraProfile[key] || 0}
                    onChange={(event) => {
                      const rawValue = event.target.value;
                      // Remove leading zeros when user types (e.g., "04" -> "4")
                      let cleanValue = rawValue;
                      if (rawValue.length > 1 && rawValue.startsWith('0') && rawValue[1] !== '.') {
                        cleanValue = rawValue.replace(/^0+/, '') || '0';
                      }
                      const numValue = parseFloat(cleanValue);
                      updateSara(key, Number.isFinite(numValue) ? numValue : 0);
                    }}
                    required
                  />
                </label>
              ))}
            </div>
            <div className="sara-actions">
              <div className={`sara-total ${saraTotal > 100 ? 'over' : ''}`}>
                Total SARA: {formatNumber(saraTotal, ' %')} • Maksimum 100%
              </div>
              <button
                type="button"
                className="ghost-button small"
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    saraProfile: {
                      saturates: 0,
                      aromatics: 0,
                      resins: 0,
                      asphaltenes: 0
                    }
                  }));
                }}
              >
                Clear SARA
              </button>
            </div>
          </div>

          <div className="card futuristic">
            <header>
              <h3>Sample Details</h3>
              <span>Acquisition metadata for this sample</span>
            </header>
            <div className="field-grid">
              <label className="field">
                <span>Sampling Date</span>
                <input
                  type="date"
                  value={form.context.samplingDate}
                  onChange={(event) => updateContext('samplingDate', event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Analysis Date</span>
                <input
                  type="date"
                  value={form.context.analysisDate}
                  onChange={(event) => updateContext('analysisDate', event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Customer ID</span>
                <input
                  type="text"
                  value={form.context.customerId}
                  onChange={(event) => updateContext('customerId', event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Area</span>
                <input
                  type="text"
                  value={form.context.area}
                  onChange={(event) => updateContext('area', event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>UWI</span>
                <input
                  type="text"
                  value={form.context.uwi}
                  onChange={(event) => updateContext('uwi', event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Common Well</span>
                <input
                  type="text"
                  value={form.context.commonWell}
                  onChange={(event) => updateContext('commonWell', event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Pour Point Temp (°F)</span>
                <input
                  type="number"
                  step={0.1}
                  value={form.context.pourPointF ?? ''}
                  onChange={(event) =>
                    updateContext(
                      'pourPointF',
                      event.target.value === '' ? null : Number(event.target.value)
                    )
                  }
                />
                {congealWarnings.pourPoint && (
                  <span className="field-warning">{congealWarnings.pourPoint}</span>
                )}
              </label>
              <label className="field">
                <span>On Site Temperature (°F)</span>
                <input
                  type="number"
                  step={0.1}
                  value={form.context.onSiteTemperatureF ?? ''}
                  onChange={(event) =>
                    updateContext(
                      'onSiteTemperatureF',
                      event.target.value === '' ? null : Number(event.target.value)
                    )
                  }
                />
                {congealWarnings.onSite && (
                  <span className="field-warning">{congealWarnings.onSite}</span>
                )}
              </label>
              <label className="field">
                <span>Viscosity (cP)</span>
                <input
                  type="number"
                  step={0.1}
                  value={form.context.viscosity ?? ''}
                  onChange={(event) =>
                    updateContext(
                      'viscosity',
                      event.target.value === '' ? null : Number(event.target.value)
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Wax Deposit (%)</span>
                <input
                  type="number"
                  step={0.1}
                  value={form.context.waxDeposit ?? ''}
                  onChange={(event) =>
                    updateContext(
                      'waxDeposit',
                      event.target.value === '' ? null : Number(event.target.value)
                    )
                  }
                />
              </label>
              <label className="field">
                <span>% C20+</span>
                <input
                  type="number"
                  step={0.1}
                  value={form.context.c20Plus ?? ''}
                  onChange={(event) =>
                    updateContext(
                      'c20Plus',
                      event.target.value === '' ? null : Number(event.target.value)
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Operator</span>
                <input
                  type="text"
                  value={form.context.operator}
                  onChange={(event) => updateContext('operator', event.target.value)}
                  required
                />
              </label>
            </div>
          </div>
        </section>

        <section className="card notes-card">
          <label className="field">
            <span>Remarks</span>
            <textarea
              rows={4}
              value={form.context.remarks ?? ''}
              onChange={(event) => updateContext('remarks', event.target.value)}
              placeholder="Add field notes, mitigation actions, or QC flags."
            />
          </label>
        </section>

        <footer className="form-footer">
          <div className="form-footer-buttons">
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? 'Calculating...' : 'Run Prediction'}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setForm(INITIAL_STATE);
                setStatus('Form reset to default sample.');
              }}
            >
              Reset Form
            </button>
          </div>
          <div className="form-footer-logos">
            <img src={noxtizLogo} alt="Noxtiz" className="footer-logo" />
            <img src={logo2} alt="Logo" className="footer-logo" />
          </div>
          <p className="form-footer-copyright">
            © 2025 Copyright by <a href="https://noxtiz.com" target="_blank" rel="noopener noreferrer">noxtiz.com</a>
          </p>
        </footer>
      </form>

      {result && (
        <section className="results-panel card neon">
          <header>
            <h3>Congeal Insights</h3>
            <span>
              {result.cacheHit ? 'Local Cache' : 'New Simulation'} •{' '}
              {new Date(result.timestamp).toLocaleString()}
            </span>
          </header>

          <div className="metrics-row">
            <div className="metric">
              <h4>Stability Index</h4>
              <span className="metric-value">{formatNumber(result?.stabilityIndex ?? 0)}</span>
              <p>Score from 0-100 indicating how steady the congeal crystal structure is.</p>
            </div>
            <div className="metric">
              <h4>Crystallization Time</h4>
              <span className="metric-value">{formatNumber(result?.crystallizationTime ?? 0, ' hrs')}</span>
              <p>Estimated duration until the oil solidifies into a stable congeal state, indicating a potential congeal event.</p>
            </div>
            <div className="metric">
              <h4>Pour Point</h4>
              <span className="metric-value">{formatNumber(result?.pourPoint ?? 0, ' °C')}</span>
              <p>Critical temperature where the flow becomes sluggish.</p>
            </div>
          </div>

          {resultCongeal && resultCongealPointer !== null && (
            <section className="result-congeal">
              <header>
                <h4>Congeal Threshold</h4>
                <span>Based on congeal index</span>
              </header>
              <div className="result-congeal-chart">
                <ul className="result-congeal-axis">
                  {['1.5', '1.2', '1.0', '0.8', '0.6', '0.4', '0.0'].map((tick) => (
                    <li key={tick}>{tick}</li>
                  ))}
                </ul>
                <div className="result-congeal-track">
                  <div
                    className="result-congeal-pointer"
                    style={{ bottom: `${resultCongealPointer}%` }}
                  >
                    <div className="result-congeal-knob" />
                    <div className="result-congeal-guide" />
                    <span className="result-congeal-tooltip">
                      {formatNumber(resultCongeal.ratio)}
                    </span>
                  </div>
                </div>
                <div className="result-congeal-summary">
                  <div className="summary-header">
                <span className="summary-label">Current</span>
                    <span className="summary-status">{resultCongeal.headline}</span>
                  </div>
              <strong>{formatNumber(resultCongeal.ratio)}</strong>
              <span className="summary-caption">
              </span>
                  <p className="summary-detail">{resultCongeal.copy}</p>
                </div>
              </div>
            </section>
          )}

          <section className="recommendations">
            <h4>Lab Recommendations</h4>
            <ul>
              {result.recommendations.map((line, index) => (
                <li key={line + index}>{line}</li>
              ))}
            </ul>
          </section>

          {dotChartPoints.length > 0 && (
            <section className="dot-chart">
              <header>
                <h4>Profile Snapshot</h4>
                <span>Visual thresholds for current run</span>
              </header>
              <div className="dot-chart-grid">
                {dotChartPoints.map((point) => (
                  <div key={point.label} className="dot-chart-row">
                    <span className="dot-label">{point.label}</span>
                    <div className="dot-track">
                      <div
                        className={`dot-point ${point.variant}`}
                        style={{ left: `${point.position}%` }}
                      >
                        <span>{point.valueLabel}</span>
                      </div>
                    </div>
                    <span className="dot-scale">{point.scaleLabel}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="results-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowReportPreview(true)}
            >
              Preview Report
            </button>
          </div>
        </section>
      )}

      {showReportPreview && result && (
        <ReportPreview
          result={result}
          resultCongeal={resultCongeal}
          resultCongealPointer={resultCongealPointer}
          onClose={() => setShowReportPreview(false)}
          onSavePDF={async () => {
            setSavingPDF(true);
            setStatus('Preparing PDF...');
            
            if (!window.sparco) {
              setStatus('Error: Sparco API not available. Please reload the application.');
              setSavingPDF(false);
              return;
            }
            
            try {
              const htmlContent = await buildReportHtml();
              if (!htmlContent) {
                setStatus('Unable to prepare report content.');
                setSavingPDF(false);
                return;
              }

              setStatus('Generating PDF...');
              const response = await window.sparco.saveReportPDF(htmlContent);
              
              if (response.success) {
                setStatus(`Report saved to ${response.filePath}`);
                setTimeout(() => {
                  setShowReportPreview(false);
                }, 1000);
              } else {
                setStatus(`Failed to save report: ${response.message || 'Unknown error'}`);
              }
            } catch (error) {
              console.error('PDF save error:', error);
              setStatus(`Error saving report: ${(error as Error).message || 'Unknown error'}`);
            } finally {
              setSavingPDF(false);
            }
          }}
          savingPDF={savingPDF}
          reportRef={reportRef}
        />
      )}

    </>
  );

  const renderScalePrediction = () => {
    // Filter groups based on selected mineral type
    const filteredGroups = SCALE_FIELD_GROUPS.filter((group) => {
      if (!group.requiredFor) return true;
      return group.requiredFor.includes(selectedMineralType);
    });

    const activeGroup = filteredGroups.find((g) => g.title === openScalePanel);

    // If active group is not in filtered groups, switch to first filtered group
    if (!activeGroup && filteredGroups.length > 0) {
      setOpenScalePanel(filteredGroups[0].title);
    }

    // Get required fields info for current mineral
    const requiredFieldsInfo = {
      barite: ['Ba²⁺ (Barium)', 'SO₄²⁻ (Sulfate)', 'Operating Conditions (T & P)'],
      calcite: ['Ca²⁺ (Calcium)', 'Alkalinity (HCO₃⁻)', 'CO₂ Gas Analysis', 'pH measured', 'Operating Conditions (T & P)'],
      sulfides: ['Fe²⁺ (Iron)', 'Zn²⁺ (Zinc)', 'H₂S Gas Analysis', 'Total H₂Saq', 'Operating Conditions (T & P)']
    };

    return (
      <div className="oddo-stage scale-stage">
        <section className="scale-metadata-header">
          <header>
            <h3>{SAMPLE_METADATA.title}</h3>
            {SAMPLE_METADATA.description && <p>{SAMPLE_METADATA.description}</p>}
          </header>
          <div className="oddo-field-grid scale-metadata-grid">
            {SAMPLE_METADATA.fields.map((field) => {
              const inputType =
                field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text';
              const step = field.type === 'number' ? '0.01' : undefined;
              const inputId = `scale-${field.key}`;

              return (
                <label key={field.key} className="oddo-field" htmlFor={inputId}>
                  <span>{field.label}</span>
                  <div className="oddo-field-input">
                    <input
                      id={inputId}
                      type={inputType}
                      step={step}
                      inputMode={field.type === 'number' ? 'decimal' : undefined}
                      value={scaleForm[field.key]}
                      placeholder={field.placeholder}
                      onChange={(event) => updateScaleField(field.key, event.target.value)}
                    />
                    {field.unit && <span>{field.unit}</span>}
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        <section className="scale-required-info">
          <h4>Required Fields for {selectedMineralType.charAt(0).toUpperCase() + selectedMineralType.slice(1)}:</h4>
          <ul>
            {requiredFieldsInfo[selectedMineralType].map((field, idx) => (
              <li key={idx}>{field}</li>
            ))}
          </ul>
        </section>

        {activeGroup && (
          <section className="scale-form-section">
            <header>
              <h3>{activeGroup.title}</h3>
              {activeGroup.description && <p>{activeGroup.description}</p>}
            </header>
            <form
              className="scale-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setScaleLoading(true);
                setScaleStatus(null);
                setScaleResult(null);

                if (!window.sparco) {
                  setScaleStatus('Error: Sparco API not available. Please reload the application.');
                  setScaleLoading(false);
                  return;
                }

                try {
                  // Parse form values
                  const parseNumber = (value: string): number => {
                    const parsed = parseFloat(value);
                    return isNaN(parsed) ? 0 : parsed;
                  };

                  const input = {
                    mineralType: selectedMineralType,
                    brineChemistry: {
                      sodium: parseNumber(scaleForm.sodium),
                      potassium: parseNumber(scaleForm.potassium),
                      magnesium: parseNumber(scaleForm.magnesium),
                      calcium: parseNumber(scaleForm.calcium),
                      strontium: parseNumber(scaleForm.strontium),
                      barium: parseNumber(scaleForm.barium),
                      iron: parseNumber(scaleForm.iron),
                      zinc: parseNumber(scaleForm.zinc),
                      lead: parseNumber(scaleForm.lead || '0'),
                      chloride: parseNumber(scaleForm.chloride),
                      sulfate: parseNumber(scaleForm.sulfate),
                      fluoride: parseNumber(scaleForm.fluoride || '0'),
                      bromide: parseNumber(scaleForm.bromide || '0'),
                      alkalinity: parseNumber(scaleForm.alkalinity),
                      carboxylicAcids: parseNumber(scaleForm.carboxylicAcids || '0'),
                      tdsMeasured: parseNumber(scaleForm.tdsMeasured || '0'),
                      calcDensity: parseNumber(scaleForm.calcDensity || '1.0')
                    },
                    gasAcidity:
                      selectedMineralType === 'calcite' || selectedMineralType === 'sulfides'
                        ? {
                            co2GasAnalysis: parseNumber(scaleForm.co2GasAnalysis || '0'),
                            h2sGasAnalysis: parseNumber(scaleForm.h2sGasAnalysis || '0'),
                            totalH2Saq: parseNumber(scaleForm.totalH2Saq || '0'),
                            phMeasured: parseNumber(scaleForm.phMeasured || '0'),
                            usePhMeasuredAtStp: parseNumber(scaleForm.usePhMeasuredAtStp || '0')
                          }
                        : undefined,
                    operatingConditions: {
                      initialTemperature: parseNumber(scaleForm.initialTemperature),
                      finalTemperature: parseNumber(scaleForm.finalTemperature),
                      initialPressure: parseNumber(scaleForm.initialPressure),
                      finalPressure: parseNumber(scaleForm.finalPressure),
                      useTpOnCalcite: parseNumber(scaleForm.useTpOnCalcite || '0')
                    },
                    inhibitors:
                      parseNumber(scaleForm.meohPerDay || '0') > 0 ||
                      parseNumber(scaleForm.megPerDay || '0') > 0
                        ? {
                            meohPerDay: parseNumber(scaleForm.meohPerDay || '0'),
                            megPerDay: parseNumber(scaleForm.megPerDay || '0')
                          }
                        : undefined
                  };

                  const result = await window.sparco.calculatePitzerScale(input);
                  setScaleResult(result);
                  setScaleStatus('Calculation completed successfully');
                } catch (error) {
                  setScaleStatus(`Error: ${(error as Error).message}`);
                  console.error('Scale calculation error:', error);
                } finally {
                  setScaleLoading(false);
                }
              }}
            >
              <div className="oddo-field-grid">
                {activeGroup.fields
                  .filter((field) => {
                    // Show field if it's required for selected mineral or has no requiredFor (show all)
                    if (!field.requiredFor) return true;
                    return field.requiredFor.includes(selectedMineralType);
                  })
                  .map((field) => {
                    const inputType =
                      field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text';
                    const step = field.type === 'number' ? '0.01' : undefined;
                    const inputId = `scale-${field.key}`;
                    const isRequired = field.requiredFor?.includes(selectedMineralType);

                    return (
                      <label key={field.key} className="oddo-field" htmlFor={inputId}>
                        <span>
                          {field.label}
                          {isRequired && <span className="field-required-indicator">*</span>}
                        </span>
                        <div className="oddo-field-input">
                          <input
                            id={inputId}
                            type={inputType}
                            step={step}
                            inputMode={field.type === 'number' ? 'decimal' : undefined}
                            value={scaleForm[field.key]}
                            placeholder={field.placeholder}
                            onChange={(event) => updateScaleField(field.key, event.target.value)}
                          />
                          {field.unit && <span>{field.unit}</span>}
                        </div>
                      </label>
                    );
                  })}
              </div>
              <div className="scale-form-actions">
                <button type="submit" className="oddo-launch-button" disabled={scaleLoading}>
                  {scaleLoading ? 'Calculating...' : 'Run Calculation'}
                </button>
                {scaleStatus && <span className="oddo-status">{scaleStatus}</span>}
              </div>
            </form>
            <footer className="form-footer scale-form-footer">
              <div className="form-footer-logos">
                <img src={noxtizLogo} alt="Noxtiz" className="footer-logo" />
                <img src={logo2} alt="Logo" className="footer-logo" />
              </div>
              <p className="form-footer-copyright">
                © 2025 Copyright by <a href="https://noxtiz.com" target="_blank" rel="noopener noreferrer">noxtiz.com</a>
              </p>
            </footer>
          </section>
        )}

        {scaleResult && (
          <section className="oddo-scale-panel">
            <header>
              <h3>{selectedMineralType.charAt(0).toUpperCase() + selectedMineralType.slice(1)} Scale Prediction</h3>
              <span>Calculation results</span>
            </header>
            <div className="oddo-scale-grid">
              <div className="oddo-scale-card">
                <span className="scale-label">Saturation Index (SI) at WH</span>
                <strong>
                  {Number.isFinite(scaleResult.saturationIndex)
                    ? scaleResult.saturationIndex.toFixed(4)
                    : 'N/A'}
                </strong>
              </div>
              <div className="oddo-scale-card">
                <span className="scale-label">Delta SI (WH - BH)</span>
                <strong>
                  {Number.isFinite(scaleResult.deltaSI)
                    ? scaleResult.deltaSI.toFixed(4)
                    : 'N/A'}
                </strong>
              </div>
              <div className="oddo-scale-card">
                <span className="scale-label">Amount to Precipitate</span>
                <strong>
                  {Number.isFinite(scaleResult.amountToPrecipitate)
                    ? `${scaleResult.amountToPrecipitate.toFixed(2)} mg/L`
                    : 'N/A'}
                </strong>
              </div>
              <div className="oddo-scale-card">
                <span className="scale-label">Status</span>
                <strong className={`scale-status-${scaleResult.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  {scaleResult.status}
                </strong>
              </div>
            </div>
            <div className="scale-calculations-detail">
              <h4>Calculation Details</h4>
              <div className="scale-detail-grid">
                <div>
                  <span>BH Temperature:</span>
                  <strong>{scaleResult.calculations.bh.temperature.toFixed(1)} °F</strong>
                </div>
                <div>
                  <span>BH Pressure:</span>
                  <strong>{scaleResult.calculations.bh.pressure.toFixed(1)} psia</strong>
                </div>
                <div>
                  <span>BH SI:</span>
                  <strong>{scaleResult.calculations.bh.si.toFixed(4)}</strong>
                </div>
                <div>
                  <span>WH Temperature:</span>
                  <strong>{scaleResult.calculations.wh.temperature.toFixed(1)} °F</strong>
                </div>
                <div>
                  <span>WH Pressure:</span>
                  <strong>{scaleResult.calculations.wh.pressure.toFixed(1)} psia</strong>
                </div>
                <div>
                  <span>WH SI:</span>
                  <strong>{scaleResult.calculations.wh.si.toFixed(4)}</strong>
                </div>
              </div>
            </div>
            {scaleResult.mineralDetails && scaleResult.mineralDetails.length > 0 && (
              <div className="scale-mineral-details">
                <h4>Mineral Breakdown</h4>
                <table className="mineral-details-table">
                  <thead>
                    <tr>
                      <th>Mineral</th>
                      <th>SI (BH)</th>
                      <th>SI (WH)</th>
                      <th>Delta SI</th>
                      {scaleResult.mineralType === 'sulfides' && <th>Amount (mg/L)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {scaleResult.mineralDetails.map((mineral, idx) => (
                      <tr key={idx}>
                        <td><strong>{mineral.name}</strong></td>
                        <td>{Number.isFinite(mineral.siBH) ? mineral.siBH.toFixed(4) : 'N/A'}</td>
                        <td>{Number.isFinite(mineral.siWH) ? mineral.siWH.toFixed(4) : 'N/A'}</td>
                        <td>{Number.isFinite(mineral.deltaSI) ? mineral.deltaSI.toFixed(4) : 'N/A'}</td>
                        {scaleResult.mineralType === 'sulfides' && (
                          <td>{Number.isFinite(mineral.amountToPrecipitate) ? mineral.amountToPrecipitate.toFixed(2) : '0.00'}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {scaleStatus && (
              <div className="scale-calculation-status">
                <small>{scaleStatus}</small>
              </div>
            )}
            <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
              <button
                className="primary-button"
                onClick={() => setShowScaleReportPreview(true)}
              >
                Preview Report
              </button>
            </div>
          </section>
        )}

      </div>
    );
  };

  return (
    <>
    <div className="labs-shell">
      <div className={`umbrella-overlay ${isTransitioning ? 'active' : ''}`}>
        <div className="umbrella-core" />
      </div>
      <aside className="labs-sidebar">
        <div className="brand-badge">
          <div className="brand-logo">
            <img src={logo} alt="Sparco — Congeal Oil Intelligence Console" />
            <div className="brand-electric" aria-hidden="true" />
          </div>
        </div>
        <nav className="sidebar-switch">
          <button
            type="button"
            className={`switch-button ${activePage === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleNavigate('dashboard')}
            disabled={isTransitioning && activePage !== 'dashboard'}
          >
            Congeal Prediction
          </button>
          <button
            type="button"
            className={`switch-button ${activePage === 'scale' ? 'active' : ''}`}
            onClick={() => handleNavigate('scale')}
            disabled={isTransitioning && activePage !== 'scale'}
          >
            Scale Prediction
          </button>
        </nav>
        {activePage === 'dashboard' && (
          <>
            <section className="sara-gauge">
              <button className="ghost-button" onClick={handleClearCache} disabled={loading}>
                Clear Engine Cache
              </button>
            </section>
            <section className="history-panel">
              <header>
                <h2>Recent Runs</h2>
                <span className="gauge-subtitle">Latest calculations only</span>
              </header>
              <div className="history-list">
                {history.filter((item) => !item.cacheHit).length === 0 && (
                  <p className="muted">No runs yet. Try running a sample.</p>
                )}
                {history
                  .filter((item) => !item.cacheHit)
                  .slice(0, 5)
                  .map((item) => {
                    const { ratio } = calculateCongealRatio(item.input.saraProfile, item.input.context);
                    return (
                      <article key={item.id} className="history-item">
                        <span className="history-batch">
                          {item.input.context.commonWell ||
                            item.input.context.customerId ||
                            item.input.context.uwi ||
                            'Sample'}
                        </span>
                        <time>{new Date(item.timestamp).toLocaleString()}</time>
                        <div className="history-score">
                          Stability {formatFixed(item.stabilityIndex, 1)} | Pour {formatFixed(item.pourPoint, 1)}°C | Ratio{' '}
                          {formatRatioValue(ratio)}
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          </>
        )}
        {activePage === 'scale' && (() => {
          const totalFields = Object.keys(scaleForm).length;
          const filledFields = Object.values(scaleForm).filter((value) => value.trim() !== '').length;
          const completion = totalFields === 0 ? 0 : Math.round((filledFields / totalFields) * 100);

          return (
            <>
              <section className="scale-sidebar-nav">
                <div className="scale-sidebar-header">
                  <h2>ScaleSparcolabs</h2>
                  <p>Pilih mineral dan kategori input</p>
                </div>
                <div className="scale-mineral-selector">
                  <h3>Mineral Type</h3>
                  <div className="scale-mineral-buttons">
                    <button
                      type="button"
                      className={`scale-mineral-button ${selectedMineralType === 'barite' ? 'active' : ''}`}
                      onClick={() => setSelectedMineralType('barite')}
                    >
                      Barite
                    </button>
                    <button
                      type="button"
                      className={`scale-mineral-button ${selectedMineralType === 'calcite' ? 'active' : ''}`}
                      onClick={() => setSelectedMineralType('calcite')}
                    >
                      Calcite
                    </button>
                    <button
                      type="button"
                      className={`scale-mineral-button ${selectedMineralType === 'sulfides' ? 'active' : ''}`}
                      onClick={() => setSelectedMineralType('sulfides')}
                    >
                      Sulfides/Fluorite/Carbonates
                    </button>
                  </div>
                </div>
                <nav className="scale-panel-nav">
                  {SCALE_FIELD_GROUPS.map((group) => (
                    <button
                      key={group.title}
                      type="button"
                      className={`scale-panel-button ${openScalePanel === group.title ? 'active' : ''}`}
                      onClick={() => setOpenScalePanel(group.title)}
                    >
                      <span>{group.title}</span>
                      {group.description && <small>{group.description}</small>}
                    </button>
                  ))}
                </nav>
                <div className="scale-progress">
                  <header>Progress Input</header>
                  <strong>{completion}%</strong>
                  <p>
                    {filledFields} dari {totalFields} field sudah terisi.
                  </p>
                </div>
              </section>
            </>
          );
        })()}
      </aside>

      <main className={`labs-stage ${activePage === 'scale' ? 'oddo-layout' : ''}`}>
        {activePage === 'dashboard' ? renderDashboard() : renderScalePrediction()}
      </main>
    </div>

    {showScaleReportPreview && scaleResult && (
      <ScaleReportPreview
        scaleResult={scaleResult}
        scaleForm={scaleForm}
        selectedMineralType={selectedMineralType}
        onClose={() => setShowScaleReportPreview(false)}
            onSavePDF={async () => {
              setSavingScalePDF(true);
              setScaleStatus('Preparing PDF...');
              
              if (!window.sparco) {
                setScaleStatus('Error: Sparco API not available. Please reload the application.');
                setSavingScalePDF(false);
                return;
              }
              
              try {
                const htmlContent = await buildScaleReportHtml();
                if (!htmlContent) {
                  setScaleStatus('Unable to prepare report content.');
                  setSavingScalePDF(false);
                  return;
                }

                setScaleStatus('Generating PDF...');
                const response = await window.sparco.saveReportPDF(htmlContent);
            
            if (response.success) {
              setScaleStatus(`Report saved to ${response.filePath}`);
              setTimeout(() => {
                setShowScaleReportPreview(false);
              }, 1000);
            } else {
              setScaleStatus(`Failed to save report: ${response.message || 'Unknown error'}`);
            }
          } catch (error) {
            console.error('PDF save error:', error);
            setScaleStatus(`Error saving report: ${(error as Error).message || 'Unknown error'}`);
          } finally {
            setSavingScalePDF(false);
          }
        }}
        savingPDF={savingScalePDF}
        reportRef={scaleReportRef}
      />
    )}
    </>
  );
};

export default App;

