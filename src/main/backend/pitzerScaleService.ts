/**
 * Pitzer-based Scale Prediction Service
 * Implements calculations for Barite, Calcite, and Sulfides/Fluorite/Carbonates
 * Based on ScaleSoftPitzer VBA macro formulas
 */

export type ScaleMineralType = 'barite' | 'calcite' | 'sulfides';

export interface BrineChemistryInput {
  // Cations (mg/L)
  sodium: number;
  potassium: number;
  magnesium: number;
  calcium: number;
  strontium: number;
  barium: number;
  iron: number;
  zinc: number;
  lead?: number;

  // Anions (mg/L)
  chloride: number;
  sulfate: number;
  fluoride?: number;
  bromide?: number;
  alkalinity: number; // as HCO3
  carboxylicAcids?: number;

  // Other
  tdsMeasured?: number;
  calcDensity?: number; // g/mL at STP
}

export interface GasAcidityInput {
  co2GasAnalysis: number; // %
  h2sGasAnalysis?: number; // %
  totalH2Saq?: number; // mg H2S/L
  phMeasured?: number; // at STP
  usePhMeasuredAtStp?: number; // 1=Yes, 0=No
}

export interface OperatingConditionsInput {
  initialTemperature: number; // °F (BH)
  finalTemperature: number; // °F (WH)
  initialPressure: number; // psia (BH)
  finalPressure: number; // psia (WH)
  useTpOnCalcite?: number; // 1=Yes, 0=No
}

export interface InhibitorInput {
  meohPerDay?: number; // B/D
  megPerDay?: number; // B/D
}

export interface ScaleCalculationInput {
  mineralType: ScaleMineralType;
  brineChemistry: BrineChemistryInput;
  gasAcidity?: GasAcidityInput;
  operatingConditions: OperatingConditionsInput;
  inhibitors?: InhibitorInput;
}

export interface MineralDetail {
  name: string;
  siBH: number;
  siWH: number;
  deltaSI: number;
  amountToPrecipitate: number; // mg/L
}

export interface ScaleCalculationResult {
  mineralType: ScaleMineralType;
  saturationIndex: number;
  deltaSI: number; // Change from BH to WH
  amountToPrecipitate: number; // mg/L
  status: 'Severe Scaling' | 'Moderate Scaling' | 'Light Scaling' | 'No Scaling';
  calculations: {
    bh: {
      temperature: number; // °F
      pressure: number; // psia
      si: number;
    };
    wh: {
      temperature: number; // °F
      pressure: number; // psia
      si: number;
    };
  };
  mineralDetails?: MineralDetail[]; // Breakdown per mineral (for sulfides, barite, calcite)
}

/**
 * Molar masses (g/mol)
 */
const MOLAR_MASS = {
  Na: 22.989769,
  K: 39.0983,
  Mg: 24.305,
  Ca: 40.078,
  Sr: 87.62,
  Ba: 137.327,
  Fe: 55.845,
  Zn: 65.38,
  Pb: 207.2,
  Cl: 35.453,
  SO4: 96.06,
  F: 18.998,
  Br: 79.904,
  HCO3: 61.0168,
  CO3: 60.0089,
  H2S: 34.081,
  S: 32.065,
  CaCO3: 100.0869,
  FeS: 87.91,
  ZnS: 97.445,
  CaF2: 78.0748,
  FeCO3: 115.854,
  ZnCO3: 125.388,
  PbS: 239.265
} as const;

/**
 * Convert mg/L to molality (mol/kg water)
 */
function mgLToMolality(mgL: number, molarMass: number, waterDensity: number = 1.0): number {
  if (mgL <= 0 || molarMass <= 0) return 0;
  // mg/L to mol/kg water: (mg/L) / (g/mol * 1000 mg/g * kg/L)
  // Assuming water density ≈ 1 kg/L
  return mgL / (molarMass * 1000 * waterDensity);
}

/**
 * Calculate Ksp for Barite (BaSO4)
 * Formula from VBA: KspBarite = 10^(136.035 - 7680.41/TK - 48.595*Log10(TK)) * 10^((0.394 - 0.0001119*TC) * Patm/500)
 */
function calculateKspBarite(temperatureF: number, pressurePsia: number): number {
  const TC = (temperatureF - 32) * (5 / 9);
  const TK = TC + 273.15;
  const Patm = pressurePsia / 14.6959; // Convert psia to atm

  const log10KspBase = 136.035 - 7680.41 / TK - 48.595 * Math.log10(TK);
  const pressureCorrection = (0.394 - 0.0001119 * TC) * (Patm / 500);

  return Math.pow(10, log10KspBase) * Math.pow(10, pressureCorrection);
}

/**
 * Calculate Ksp for Calcite (CaCO3)
 * Formula from VBA: KspCalcite = 10^(-171.9065 - 0.077993*TK + 2839.319/TK + 71.595*Log10(TK)) * Exp(-(-48.76 - 0.5304*TC) * (Patm - 1) / (R * TK))
 * R = 83.144 (from VBA)
 */
function calculateKspCalcite(temperatureF: number, pressurePsia: number): number {
  const TC = (temperatureF - 32) * (5 / 9);
  const TK = TC + 273.15;
  const Patm = pressurePsia / 14.7; // VBA uses 14.7, not 14.6959
  const R = 83.144; // VBA constant

  const log10KspBase = -171.9065 - 0.077993 * TK + 2839.319 / TK + 71.595 * Math.log10(TK);
  const pressureCorrection = -(-48.76 - 0.5304 * TC) * ((Patm - 1) / (R * TK));

  return Math.pow(10, log10KspBase) * Math.exp(pressureCorrection);
}

/**
 * Calculate Ksp for FeS (Pyrrhotite)
 * Formula from VBA: KspFeS = 10^((-1) * (-13.53 + 2731.3/TK + 0.02654*TK)) * 10^((0.2 - 0.00005*TC) * Patm/500)
 */
function calculateKspFeS(temperatureF: number, pressurePsia: number): number {
  const TC = (temperatureF - 32) * (5 / 9);
  const TK = TC + 273.15;
  const Patm = pressurePsia / 14.7;
  
  const log10KspBase = -1 * (-13.53 + 2731.3 / TK + 0.02654 * TK);
  const pressureCorrection = (0.2 - 0.00005 * TC) * (Patm / 500);
  
  return Math.pow(10, log10KspBase) * Math.pow(10, pressureCorrection);
}

/**
 * Calculate Ksp for ZnS (Sphalerite)
 * Formula from VBA: KspZnS = 10^((-1) * (-5.624 + 3775.8/TK + 0.01665*TK)) * 10^((0.198 - 0.0000094*TC) * Patm/500)
 */
function calculateKspZnS(temperatureF: number, pressurePsia: number): number {
  const TC = (temperatureF - 32) * (5 / 9);
  const TK = TC + 273.15;
  const Patm = pressurePsia / 14.7;
  
  const log10KspBase = -1 * (-5.624 + 3775.8 / TK + 0.01665 * TK);
  const pressureCorrection = (0.198 - 0.0000094 * TC) * (Patm / 500);
  
  return Math.pow(10, log10KspBase) * Math.pow(10, pressureCorrection);
}

/**
 * Calculate Ksp for CaF2 (Fluorite)
 * Formula from VBA: KspCaF2 = 10^(66.348 - 4298.2/TK - 25.271*Log10(TK)) * 10^((0.399 - 0.0000047*TC) * Patm/500)
 */
function calculateKspCaF2(temperatureF: number, pressurePsia: number): number {
  const TC = (temperatureF - 32) * (5 / 9);
  const TK = TC + 273.15;
  const Patm = pressurePsia / 14.7;
  
  const log10KspBase = 66.348 - 4298.2 / TK - 25.271 * Math.log10(TK);
  const pressureCorrection = (0.399 - 0.0000047 * TC) * (Patm / 500);
  
  return Math.pow(10, log10KspBase) * Math.pow(10, pressureCorrection);
}

/**
 * Calculate Ksp for FeCO3 (Siderite)
 * Formula from VBA: KspSiderite = Exp(129.97/TK - 50.205 + 7.3143*Log(TK) - 0.052913*TK) * Exp(-(-48.76 - 0.5304*TC) * (Patm - 1) / (R * TK))
 * R = 83.144 (from VBA)
 */
function calculateKspFeCO3(temperatureF: number, pressurePsia: number): number {
  const TC = (temperatureF - 32) * (5 / 9);
  const TK = TC + 273.15;
  const Patm = pressurePsia / 14.7;
  const R = 83.144; // VBA constant
  
  const logKspBase = 129.97 / TK - 50.205 + 7.3143 * Math.log(TK) - 0.052913 * TK;
  const pressureCorrection = -(-48.76 - 0.5304 * TC) * ((Patm - 1) / (R * TK));
  
  return Math.exp(logKspBase) * Math.exp(pressureCorrection);
}

/**
 * Calculate Ksp for ZnCO3 (Smithsonite)
 * Formula from VBA: KspZnCO3 = 10^((-1) * (8.7334 - 2173.9249/TK + 1.4880105*Log(TK))) * 10^((0.468 - 0.000176*TC) * Patm/500)
 */
function calculateKspZnCO3(temperatureF: number, pressurePsia: number): number {
  const TC = (temperatureF - 32) * (5 / 9);
  const TK = TC + 273.15;
  const Patm = pressurePsia / 14.7;
  
  const log10KspBase = -1 * (8.7334 - 2173.9249 / TK + 1.4880105 * Math.log(TK));
  const pressureCorrection = (0.468 - 0.000176 * TC) * (Patm / 500);
  
  return Math.pow(10, log10KspBase) * Math.pow(10, pressureCorrection);
}

/**
 * Calculate Ksp for PbS (Galena)
 * Formula from VBA: KspPbS = 10^((-1) * (-113.5078 + 9437.02/TK + 16.967*Log(TK))) * 10^((0.202 - 0.0000663*TC) * Patm/500)
 */
function calculateKspPbS(temperatureF: number, pressurePsia: number): number {
  const TC = (temperatureF - 32) * (5 / 9);
  const TK = TC + 273.15;
  const Patm = pressurePsia / 14.7;
  
  const log10KspBase = -1 * (-113.5078 + 9437.02 / TK + 16.967 * Math.log(TK));
  const pressureCorrection = (0.202 - 0.0000663 * TC) * (Patm / 500);
  
  return Math.pow(10, log10KspBase) * Math.pow(10, pressureCorrection);
}

/**
 * Simplified activity coefficients (placeholder - full Pitzer model is complex)
 * For now, using extended Debye-Hückel approximation
 * TODO: Implement full Pitzer model with interaction parameters
 */
function calculateActivityCoefficient(
  charge: number,
  ionicStrength: number,
  temperatureC: number
): number {
  if (ionicStrength <= 0) return 1.0;

  const TK = temperatureC + 273.15;
  const A = 0.5085 - 0.00028 * (temperatureC - 25);
  const B = 0.3281 - 0.0001 * (temperatureC - 25);
  const sqrtI = Math.sqrt(ionicStrength);
  const ionSize = 4.0; // Average ion size parameter (Å)

  const term = (-A * charge * charge * sqrtI) / (1 + B * ionSize * sqrtI);
  return Math.pow(10, term + 0.3 * A * charge * charge * ionicStrength);
}

/**
 * Calculate ionic strength from brine chemistry
 */
function calculateIonicStrength(
  brine: BrineChemistryInput,
  waterDensity: number = 1.0
): number {
  const molalities = {
    Na: mgLToMolality(brine.sodium, MOLAR_MASS.Na, waterDensity),
    K: mgLToMolality(brine.potassium, MOLAR_MASS.K, waterDensity),
    Mg: mgLToMolality(brine.magnesium, MOLAR_MASS.Mg, waterDensity),
    Ca: mgLToMolality(brine.calcium, MOLAR_MASS.Ca, waterDensity),
    Sr: mgLToMolality(brine.strontium, MOLAR_MASS.Sr, waterDensity),
    Ba: mgLToMolality(brine.barium, MOLAR_MASS.Ba, waterDensity),
    Fe: mgLToMolality(brine.iron, MOLAR_MASS.Fe, waterDensity),
    Zn: mgLToMolality(brine.zinc, MOLAR_MASS.Zn, waterDensity),
    Cl: mgLToMolality(brine.chloride, MOLAR_MASS.Cl, waterDensity),
    SO4: mgLToMolality(brine.sulfate, MOLAR_MASS.SO4, waterDensity),
    HCO3: mgLToMolality(brine.alkalinity, MOLAR_MASS.HCO3, waterDensity)
  };

  let I = 0;
  // Cations
  I += molalities.Na * 1 * 1;
  I += molalities.K * 1 * 1;
  I += molalities.Mg * 2 * 2;
  I += molalities.Ca * 2 * 2;
  I += molalities.Sr * 2 * 2;
  I += molalities.Ba * 2 * 2;
  I += molalities.Fe * 2 * 2;
  I += molalities.Zn * 2 * 2;
  // Anions
  I += molalities.Cl * 1 * 1;
  I += molalities.SO4 * 2 * 2;
  I += molalities.HCO3 * 1 * 1;

  return 0.5 * I;
}

/**
 * Calculate Barite Saturation Index
 * Formula: SI = Log10([Ba²⁺] * [SO₄²⁻] * γ(Ba²⁺) * γ(SO₄²⁻) / Ksp)
 */
function calculateBariteSI(
  brine: BrineChemistryInput,
  temperatureF: number,
  pressurePsia: number,
  inhibitors?: InhibitorInput
): number {
  const TC = (temperatureF - 32) * (5 / 9);
  const waterDensity = brine.calcDensity ?? 1.0;

  // Convert to molality
  const mBa = mgLToMolality(brine.barium, MOLAR_MASS.Ba, waterDensity);
  const mSO4 = mgLToMolality(brine.sulfate, MOLAR_MASS.SO4, waterDensity);

  if (mBa <= 0 || mSO4 <= 0) {
    return Number.NEGATIVE_INFINITY;
  }

  // Calculate ionic strength
  const ionicStrength = calculateIonicStrength(brine, waterDensity);

  // Activity coefficients
  const gammaBa = calculateActivityCoefficient(2, ionicStrength, TC);
  const gammaSO4 = calculateActivityCoefficient(2, ionicStrength, TC);

  // Ksp
  const Ksp = calculateKspBarite(temperatureF, pressurePsia);

  // Ion Activity Product (IAP)
  const IAP = mBa * mSO4 * gammaBa * gammaSO4;

  // Saturation Index
  let SI = Math.log10(IAP / Ksp);

  // Inhibitor corrections (simplified - full implementation needs more data)
  // dSIMeOHBar and dSIMEGBar from VBA
  if (inhibitors) {
    // TODO: Implement proper inhibitor corrections
    // For now, placeholder
  }

  return SI;
}

/**
 * Calculate pH from CO2 or use measured pH
 * Helper function for sulfides calculations
 */
function calculatepHForSulfides(
  gasAcidity: GasAcidityInput | undefined,
  temperatureF: number,
  pressurePsia: number,
  brine: BrineChemistryInput,
  waterDensity: number
): number {
  const TC = (temperatureF - 32) * (5 / 9);
  const TK = TC + 273.15;
  const Patm = pressurePsia / 14.7;
  const R = 83.144;
  
  // Use measured pH if available
  if (gasAcidity?.usePhMeasuredAtStp === 1 && gasAcidity?.phMeasured) {
    return gasAcidity.phMeasured;
  }
  
  // Calculate pH from CO2 if available
  if (gasAcidity?.co2GasAnalysis && gasAcidity.co2GasAnalysis > 0) {
    const K1 = Math.pow(10, -356.3094 - 0.06091964 * TK + 21834.37 / TK + 126.8339 * Math.log10(TK) - 1684915 / (TK * TK)) 
      * Math.exp(-(-25.5 + 0.1271 * TC) * ((Patm - 1) / (R * TK)));
    
    const PCO2 = (gasAcidity.co2GasAnalysis / 100) * Patm;
    const H_CO2 = Math.pow(10, -1.47 + 0.009 * TC - 2400 / TK);
    const CO2aq = H_CO2 * PCO2;
    
    const sqrtTerm = Math.sqrt(K1 * CO2aq);
    if (sqrtTerm > 0) {
      let pH = -Math.log10(sqrtTerm);
      
      // Refine using alkalinity if available
      const mHCO3 = mgLToMolality(brine.alkalinity, MOLAR_MASS.HCO3, waterDensity);
      if (mHCO3 > 0) {
        const K2 = Math.pow(10, -107.8871 - 0.03252849 * TK + 5151.79 / TK + 38.92561 * Math.log10(TK) - 563713.9 / (TK * TK)) 
          * Math.exp(-(-15.82 - 0.0219 * TC) * ((Patm - 1) / (R * TK)));
        const aH_est = Math.pow(10, -pH);
        const HCO3_from_CO2 = (K1 * CO2aq) / aH_est;
        const total_alkalinity = mHCO3 + HCO3_from_CO2;
        if (total_alkalinity > 0) {
          const aH_refined = Math.sqrt(K1 * CO2aq * K2 / total_alkalinity);
          if (aH_refined > 0) {
            pH = -Math.log10(aH_refined);
          }
        }
      }
      return pH;
    }
  }
  
  // Default fallback
  return gasAcidity?.phMeasured ?? 7.0;
}

/**
 * Calculate HS (bisulfide) from total H2S aqueous
 * Formula from VBA: HS = TH2Saq / (aH * gAn(iHS) * gNAn(iHS) / (K1H2S * gNeut(iH2Saq) * gNNeut(iH2Saq)) + 1)
 */
function calculateHSFromH2S(
  totalH2Saq: number,
  pH: number,
  temperatureF: number,
  pressurePsia: number,
  ionicStrength: number,
  waterDensity: number
): number {
  if (totalH2Saq <= 0) return 0;
  
  const TC = (temperatureF - 32) * (5 / 9);
  const TK = TC + 273.15;
  const Patm = pressurePsia / 14.7;
  const R = 83.144;
  
  // K1H2S from VBA
  const K1H2S = Math.pow(10, -1 * (-12.41 + 3539.1 / TK + 0.02522 * TK)) 
    * Math.exp(-(-14.8 + 0.002 * TC - 0.0004 * TC * TC) * ((Patm - 1) / (R * TK)));
  
  const aH = Math.pow(10, -pH);
  const gammaHS = calculateActivityCoefficient(1, ionicStrength, TC);
  const gammaH2Saq = 1.0; // Simplified - neutral species activity coefficient ≈ 1
  
  // Simplified: assume gNAn(iHS) ≈ gammaHS and gNNeut(iH2Saq) ≈ 1
  // Full VBA: HS = TH2Saq / (aH * gAn(iHS) * gNAn(iHS) / (K1H2S * gNeut(iH2Saq) * gNNeut(iH2Saq)) + 1)
  const mH2S_total = mgLToMolality(totalH2Saq, MOLAR_MASS.H2S, waterDensity);
  const denominator = (aH * gammaHS) / (K1H2S * gammaH2Saq) + 1;
  
  if (denominator <= 0) return 0;
  return mH2S_total / denominator;
}

/**
 * Calculate Sulfides Saturation Index with detailed breakdown
 * Returns both the highest SI and detailed SI for each mineral
 */
function calculateSulfidesSIDetailed(
  brine: BrineChemistryInput,
  gasAcidity: GasAcidityInput | undefined,
  temperatureF: number,
  pressurePsia: number,
  inhibitors?: InhibitorInput
): { maxSI: number; details: Array<{ name: string; si: number }> } {
  const TC = (temperatureF - 32) * (5 / 9);
  const TK = TC + 273.15;
  const waterDensity = brine.calcDensity ?? 1.0;
  const ionicStrength = calculateIonicStrength(brine, waterDensity);
  const Patm = pressurePsia / 14.7;
  const R = 83.144;
  
  // Calculate pH once for all calculations
  const pH = calculatepHForSulfides(gasAcidity, temperatureF, pressurePsia, brine, waterDensity);
  const aH = Math.pow(10, -pH);
  
  // Calculate K2 for carbonates
  const K2 = Math.pow(10, -107.8871 - 0.03252849 * TK + 5151.79 / TK + 38.92561 * Math.log10(TK) - 563713.9 / (TK * TK)) 
    * Math.exp(-(-15.82 - 0.0219 * TC) * ((Patm - 1) / (R * TK)));
  
  const details: Array<{ name: string; si: number }> = [];
  let maxSI = Number.NEGATIVE_INFINITY;
  
  // FeS - Formula from VBA: SIFeS = Log10(mc(iFe) * HS * gCat(iFe) * gAn(iHS) * gNAn(iHS) / aH / KspFeS)
  if (brine.iron > 0 && gasAcidity?.totalH2Saq && gasAcidity.totalH2Saq > 0) {
    const mFe = mgLToMolality(brine.iron, MOLAR_MASS.Fe, waterDensity);
    const HS = calculateHSFromH2S(gasAcidity.totalH2Saq, pH, temperatureF, pressurePsia, ionicStrength, waterDensity);
    if (HS > 0) {
      const gammaFe = calculateActivityCoefficient(2, ionicStrength, TC);
      const gammaHS = calculateActivityCoefficient(1, ionicStrength, TC);
      const Ksp = calculateKspFeS(temperatureF, pressurePsia);
      const IAP = (mFe * HS * gammaFe * gammaHS) / aH;
      const SI = Math.log10(IAP / Ksp);
      details.push({ name: 'FeS', si: SI });
      maxSI = Math.max(maxSI, SI);
    }
  }
  
  // ZnS - Formula from VBA: SIZnS = Log10(mc(iZn) * HS * gCat(iZn) * gAn(iHS) * gNAn(iHS) / aH / KspZnS)
  if (brine.zinc > 0 && gasAcidity?.totalH2Saq && gasAcidity.totalH2Saq > 0) {
    const mZn = mgLToMolality(brine.zinc, MOLAR_MASS.Zn, waterDensity);
    const HS = calculateHSFromH2S(gasAcidity.totalH2Saq, pH, temperatureF, pressurePsia, ionicStrength, waterDensity);
    if (HS > 0) {
      const gammaZn = calculateActivityCoefficient(2, ionicStrength, TC);
      const gammaHS = calculateActivityCoefficient(1, ionicStrength, TC);
      const Ksp = calculateKspZnS(temperatureF, pressurePsia);
      const IAP = (mZn * HS * gammaZn * gammaHS) / aH;
      const SI = Math.log10(IAP / Ksp);
      details.push({ name: 'ZnS', si: SI });
      maxSI = Math.max(maxSI, SI);
    }
  }
  
  // CaF2 - Formula from VBA: SICaF2 = Log10((mc(iCa) * (ma(intF)^2) * gCat(iCa) * gAn(intF)^2 / KspCaF2))
  if (brine.calcium > 0 && brine.fluoride && brine.fluoride > 0) {
    const mCa = mgLToMolality(brine.calcium, MOLAR_MASS.Ca, waterDensity);
    const mF = mgLToMolality(brine.fluoride, MOLAR_MASS.F, waterDensity);
    const gammaCa = calculateActivityCoefficient(2, ionicStrength, TC);
    const gammaF = calculateActivityCoefficient(1, ionicStrength, TC);
    const Ksp = calculateKspCaF2(temperatureF, pressurePsia);
    const IAP = mCa * mF * mF * gammaCa * gammaF * gammaF;
    const SI = Math.log10(IAP / Ksp);
    details.push({ name: 'CaF2', si: SI });
    maxSI = Math.max(maxSI, SI);
  }
  
  // FeCO3 (Siderite) - Formula from VBA: SISid = Log10(mc(iFe) * HCO3 * gCat(iFe) * gAn(iHCO3) * K2HCO3 / (aH * KspSiderite))
  if (brine.iron > 0 && brine.alkalinity > 0) {
    const mFe = mgLToMolality(brine.iron, MOLAR_MASS.Fe, waterDensity);
    const mHCO3 = mgLToMolality(brine.alkalinity, MOLAR_MASS.HCO3, waterDensity);
    const gammaFe = calculateActivityCoefficient(2, ionicStrength, TC);
    const gammaHCO3 = calculateActivityCoefficient(1, ionicStrength, TC);
    const Ksp = calculateKspFeCO3(temperatureF, pressurePsia);
    const IAP = (mFe * mHCO3 * gammaFe * gammaHCO3 * K2) / aH;
    const SI = Math.log10(IAP / Ksp);
    details.push({ name: 'FeCO3', si: SI });
    maxSI = Math.max(maxSI, SI);
  }
  
  // ZnCO3 - Formula from VBA: SIZnCO3 = Log10(mc(iZn) * CO3 * gCat(iZn) * gAn(iCO3) / KspZnCO3)
  // Note: CO3 is calculated from HCO3 using K2
  if (brine.zinc > 0 && brine.alkalinity > 0) {
    const mZn = mgLToMolality(brine.zinc, MOLAR_MASS.Zn, waterDensity);
    const mHCO3 = mgLToMolality(brine.alkalinity, MOLAR_MASS.HCO3, waterDensity);
    const gammaZn = calculateActivityCoefficient(2, ionicStrength, TC);
    const gammaCO3 = calculateActivityCoefficient(2, ionicStrength, TC);
    const Ksp = calculateKspZnCO3(temperatureF, pressurePsia);
    const mCO3 = (K2 * mHCO3) / aH; // CO3 from HCO3
    const IAP = mZn * mCO3 * gammaZn * gammaCO3;
    const SI = Math.log10(IAP / Ksp);
    details.push({ name: 'ZnCO3', si: SI });
    maxSI = Math.max(maxSI, SI);
  }
  
  // PbS - Formula from VBA: SIPbS = Log10(mc(iPb) * HS * gCat(iPb) * gAn(iHS) * gNAn(iHS) / aH / KspPbS)
  if (brine.lead && brine.lead > 0 && gasAcidity?.totalH2Saq && gasAcidity.totalH2Saq > 0) {
    const mPb = mgLToMolality(brine.lead, MOLAR_MASS.Pb, waterDensity);
    const HS = calculateHSFromH2S(gasAcidity.totalH2Saq, pH, temperatureF, pressurePsia, ionicStrength, waterDensity);
    if (HS > 0) {
      const gammaPb = calculateActivityCoefficient(2, ionicStrength, TC);
      const gammaHS = calculateActivityCoefficient(1, ionicStrength, TC);
      const Ksp = calculateKspPbS(temperatureF, pressurePsia);
      const IAP = (mPb * HS * gammaPb * gammaHS) / aH;
      const SI = Math.log10(IAP / Ksp);
      details.push({ name: 'PbS', si: SI });
      maxSI = Math.max(maxSI, SI);
    }
  }
  
  return { maxSI: maxSI === Number.NEGATIVE_INFINITY ? 0 : maxSI, details };
}

/**
 * Calculate Sulfides Saturation Index
 * Returns the highest SI among FeS, ZnS, CaF2, FeCO3, ZnCO3, PbS
 */
function calculateSulfidesSI(
  brine: BrineChemistryInput,
  gasAcidity: GasAcidityInput | undefined,
  temperatureF: number,
  pressurePsia: number,
  inhibitors?: InhibitorInput
): number {
  return calculateSulfidesSIDetailed(brine, gasAcidity, temperatureF, pressurePsia, inhibitors).maxSI;
}

/**
 * Calculate Calcite Saturation Index
 * Formula: SI = Log10([Ca²⁺] * [HCO₃⁻] * γ(Ca²⁺) * γ(HCO₃⁻) * K2 / (aH * Ksp))
 */
function calculateCalciteSI(
  brine: BrineChemistryInput,
  gasAcidity: GasAcidityInput | undefined,
  temperatureF: number,
  pressurePsia: number,
  inhibitors?: InhibitorInput
): number {
  const TC = (temperatureF - 32) * (5 / 9);
  const TK = TC + 273.15;
  const waterDensity = brine.calcDensity ?? 1.0;

  // Convert to molality
  const mCa = mgLToMolality(brine.calcium, MOLAR_MASS.Ca, waterDensity);
  const mHCO3 = mgLToMolality(brine.alkalinity, MOLAR_MASS.HCO3, waterDensity);

  if (mCa <= 0 || mHCO3 <= 0) {
    return Number.NEGATIVE_INFINITY;
  }

  // Calculate ionic strength
  const ionicStrength = calculateIonicStrength(brine, waterDensity);

  // Activity coefficients
  const gammaCa = calculateActivityCoefficient(2, ionicStrength, TC);
  const gammaHCO3 = calculateActivityCoefficient(1, ionicStrength, TC);

  // K1 and K2 from VBA (exact formulas)
  // K1H2CO3 = (10^(-356.3094 - 0.06091964*TK + 21834.37/TK + 126.8339*Log10(TK) - 1684915/TK^2)) * Exp(-(-25.5 + 0.1271*TC) * (Patm - 1) / (R * TK))
  // K2HCO3 = 10^(-107.8871 - 0.03252849*TK + 5151.79/TK + 38.92561*Log10(TK) - 563713.9/TK^2) * Exp(-(-15.82 - 0.0219*TC) * (Patm - 1) / (R * TK))
  const Patm = pressurePsia / 14.7;
  const R = 83.144; // VBA constant
  
  const K1 = Math.pow(10, -356.3094 - 0.06091964 * TK + 21834.37 / TK + 126.8339 * Math.log10(TK) - 1684915 / (TK * TK)) 
    * Math.exp(-(-25.5 + 0.1271 * TC) * ((Patm - 1) / (R * TK)));
  
  const K2 = Math.pow(10, -107.8871 - 0.03252849 * TK + 5151.79 / TK + 38.92561 * Math.log10(TK) - 563713.9 / (TK * TK)) 
    * Math.exp(-(-15.82 - 0.0219 * TC) * ((Patm - 1) / (R * TK)));

  // pH calculation from CO2
  // Formula from ScaleSoftPitzer VBA: pH calculation based on CO2 partial pressure and alkalinity
  let pH = gasAcidity?.phMeasured ?? 7.0;
  if (gasAcidity?.usePhMeasuredAtStp === 1 && gasAcidity?.phMeasured) {
    // Use measured pH at STP
    pH = gasAcidity.phMeasured;
  } else if (gasAcidity?.co2GasAnalysis && gasAcidity.co2GasAnalysis > 0) {
    // Calculate pH from CO2 partial pressure using ScaleSoftPitzer formula
    const Patm = pressurePsia / 14.6959;
    
    // CO2 partial pressure (atm)
    const PCO2 = (gasAcidity.co2GasAnalysis / 100) * Patm;
    
    // Henry's law constant for CO2 (mol/L/atm) at temperature
    // Formula: log10(H_CO2) = -1.47 + 0.009*TC - 2400/TK
    const H_CO2 = Math.pow(10, -1.47 + 0.009 * TC - 2400 / TK);
    
    // CO2(aq) concentration
    const CO2aq = H_CO2 * PCO2;
    
    // Calculate pH using charge balance with alkalinity
    // For ScaleSoftPitzer: pH = -log10(aH) where aH is calculated from CO2 and HCO3-
    // Simplified: pH ≈ -log10(sqrt(K1 * CO2aq)) for low ionic strength
    // More accurate: iterative solution considering HCO3- and CO3²-
    const sqrtTerm = Math.sqrt(K1 * CO2aq);
    if (sqrtTerm > 0) {
      // Initial estimate
      pH = -Math.log10(sqrtTerm);
      
      // Refine using alkalinity if available
      if (mHCO3 > 0) {
        // Iterative refinement (simplified - full VBA uses Newton-Raphson)
        // pH = -log10(aH) where aH satisfies charge balance
        const aH_est = Math.pow(10, -pH);
        const HCO3_from_CO2 = (K1 * CO2aq) / aH_est;
        const total_alkalinity = mHCO3 + HCO3_from_CO2;
        if (total_alkalinity > 0) {
          // Refined pH estimate
          const aH_refined = Math.sqrt(K1 * CO2aq * K2 / total_alkalinity);
          if (aH_refined > 0) {
            pH = -Math.log10(aH_refined);
          }
        }
      }
    } else {
      pH = 7.0; // Default fallback
    }
  }
  const aH = Math.pow(10, -pH);

  // Ksp
  const Ksp = calculateKspCalcite(temperatureF, pressurePsia);

  // Ion Activity Product
  const IAP = (mCa * mHCO3 * gammaCa * gammaHCO3 * K2) / aH;

  // Saturation Index
  let SI = Math.log10(IAP / Ksp);

  // Inhibitor corrections
  if (inhibitors) {
    // TODO: Implement proper inhibitor corrections
  }

  return SI;
}

/**
 * Calculate amount of mineral to precipitate (mg/L)
 * For Barite: ppt = solution of quadratic equation
 */
function calculatePrecipitationAmount(
  mineralType: ScaleMineralType,
  SI: number,
  brine: BrineChemistryInput,
  temperatureF: number,
  pressurePsia: number,
  gasAcidity?: GasAcidityInput
): number {
  if (SI <= 0) return 0;

  const TC = (temperatureF - 32) * (5 / 9);
  const waterDensity = brine.calcDensity ?? 1.0;

  if (mineralType === 'barite') {
    const mBa = mgLToMolality(brine.barium, MOLAR_MASS.Ba, waterDensity);
    const mSO4 = mgLToMolality(brine.sulfate, MOLAR_MASS.SO4, waterDensity);

    const ionicStrength = calculateIonicStrength(brine, waterDensity);
    const gammaBa = calculateActivityCoefficient(2, ionicStrength, TC);
    const gammaSO4 = calculateActivityCoefficient(2, ionicStrength, TC);
    const Ksp = calculateKspBarite(temperatureF, pressurePsia);

    // Quadratic: a*x² + b*x + c = 0
    // Where x is ppt (molality)
    const a = 1;
    const b = -(mBa + mSO4);
    const c = mBa * mSO4 - Ksp / (gammaBa * gammaSO4);

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return 0;

    const ppt = (-b + Math.sqrt(discriminant)) / (2 * a);
    if (ppt <= 0) return 0;

    // Convert to mg/L: ppt (mol/kg) * MW (g/mol) * 1000 (mg/g) * density (kg/L)
    // Formula from VBA: ppt * 233390 * (rho25c - TDS / 1000000)
    const rho25c = waterDensity;
    const TDS = brine.tdsMeasured ?? 0;
    return ppt * 233390 * (rho25c - TDS / 1000000);
  }

  if (mineralType === 'calcite') {
    const mCa = mgLToMolality(brine.calcium, MOLAR_MASS.Ca, waterDensity);
    const mHCO3 = mgLToMolality(brine.alkalinity, MOLAR_MASS.HCO3, waterDensity);

    if (mCa <= 0 || mHCO3 <= 0) return 0;

    const ionicStrength = calculateIonicStrength(brine, waterDensity);
    const gammaCa = calculateActivityCoefficient(2, ionicStrength, TC);
    const gammaHCO3 = calculateActivityCoefficient(1, ionicStrength, TC);
    const Ksp = calculateKspCalcite(temperatureF, pressurePsia);
    
    const TK = TC + 273.15;
    const Patm = pressurePsia / 14.7;
    const R = 83.144;
    const K2 = Math.pow(10, -107.8871 - 0.03252849 * TK + 5151.79 / TK + 38.92561 * Math.log10(TK) - 563713.9 / (TK * TK)) 
      * Math.exp(-(-15.82 - 0.0219 * TC) * ((Patm - 1) / (R * TK)));
    
    // Simplified: assume pH doesn't change significantly during precipitation
    // For more accurate calculation, need iterative approach
    const pH = 7.0; // Approximate
    const aH = Math.pow(10, -pH);
    
    // IAP = [Ca²⁺][HCO₃⁻]γ(Ca²⁺)γ(HCO₃⁻)K₂ / aH
    const IAP = (mCa * mHCO3 * gammaCa * gammaHCO3 * K2) / aH;
    
    if (IAP <= Ksp) return 0;
    
    // Approximate precipitation using simplified mass balance
    // This is a simplified calculation - full VBA uses iterative method
    const excessRatio = IAP / Ksp;
    const pptMolality = mCa * (1 - 1 / excessRatio);
    
    if (pptMolality <= 0) return 0;
    
    // Convert to mg/L: ppt (mol/kg) * MW (g/mol) * 1000 (mg/g) * density (kg/L)
    const rho25c = waterDensity;
    const TDS = brine.tdsMeasured ?? 0;
    return pptMolality * MOLAR_MASS.CaCO3 * 1000 * (rho25c - TDS / 1000000);
  }

  if (mineralType === 'sulfides') {
    // For sulfides, calculate the dominant mineral
    // Return the highest precipitation amount among all sulfide minerals
    let maxPpt = 0;
    
    // FeS
    if (brine.iron > 0 && gasAcidity?.totalH2Saq && gasAcidity.totalH2Saq > 0) {
      const mFe = mgLToMolality(brine.iron, MOLAR_MASS.Fe, waterDensity);
      const mH2S = mgLToMolality(gasAcidity.totalH2Saq, MOLAR_MASS.H2S, waterDensity);
      const ionicStrength = calculateIonicStrength(brine, waterDensity);
      const gammaFe = calculateActivityCoefficient(2, ionicStrength, TC);
      const gammaS = calculateActivityCoefficient(2, ionicStrength, TC);
      const Ksp = calculateKspFeS(temperatureF, pressurePsia);
      
      const IAP = mFe * mH2S * gammaFe * gammaS;
      if (IAP > Ksp) {
        const ppt = Math.min(mFe, mH2S) * (1 - Ksp / IAP);
        const rho25c = waterDensity;
        const TDS = brine.tdsMeasured ?? 0;
        maxPpt = Math.max(maxPpt, ppt * MOLAR_MASS.FeS * 1000 * (rho25c - TDS / 1000000));
      }
    }
    
    // ZnS
    if (brine.zinc > 0 && gasAcidity?.totalH2Saq && gasAcidity.totalH2Saq > 0) {
      const mZn = mgLToMolality(brine.zinc, MOLAR_MASS.Zn, waterDensity);
      const mH2S = mgLToMolality(gasAcidity.totalH2Saq, MOLAR_MASS.H2S, waterDensity);
      const ionicStrength = calculateIonicStrength(brine, waterDensity);
      const gammaZn = calculateActivityCoefficient(2, ionicStrength, TC);
      const gammaS = calculateActivityCoefficient(2, ionicStrength, TC);
      const Ksp = calculateKspZnS(temperatureF, pressurePsia);
      
      const IAP = mZn * mH2S * gammaZn * gammaS;
      if (IAP > Ksp) {
        const ppt = Math.min(mZn, mH2S) * (1 - Ksp / IAP);
        const rho25c = waterDensity;
        const TDS = brine.tdsMeasured ?? 0;
        maxPpt = Math.max(maxPpt, ppt * MOLAR_MASS.ZnS * 1000 * (rho25c - TDS / 1000000));
      }
    }
    
    // CaF2
    if (brine.calcium > 0 && brine.fluoride && brine.fluoride > 0) {
      const mCa = mgLToMolality(brine.calcium, MOLAR_MASS.Ca, waterDensity);
      const mF = mgLToMolality(brine.fluoride, MOLAR_MASS.F, waterDensity);
      const ionicStrength = calculateIonicStrength(brine, waterDensity);
      const gammaCa = calculateActivityCoefficient(2, ionicStrength, TC);
      const gammaF = calculateActivityCoefficient(1, ionicStrength, TC);
      const Ksp = calculateKspCaF2(temperatureF, pressurePsia);
      
      const IAP = mCa * mF * mF * gammaCa * gammaF * gammaF;
      if (IAP > Ksp) {
        // For CaF2: Ksp = [Ca²⁺][F⁻]²
        const ppt = Math.min(mCa, mF / 2) * (1 - Math.sqrt(Ksp / IAP));
        const rho25c = waterDensity;
        const TDS = brine.tdsMeasured ?? 0;
        maxPpt = Math.max(maxPpt, ppt * MOLAR_MASS.CaF2 * 1000 * (rho25c - TDS / 1000000));
      }
    }
    
    // FeCO3
    if (brine.iron > 0 && brine.alkalinity > 0) {
      const mFe = mgLToMolality(brine.iron, MOLAR_MASS.Fe, waterDensity);
      const mHCO3 = mgLToMolality(brine.alkalinity, MOLAR_MASS.HCO3, waterDensity);
      const ionicStrength = calculateIonicStrength(brine, waterDensity);
      const gammaFe = calculateActivityCoefficient(2, ionicStrength, TC);
      const gammaHCO3 = calculateActivityCoefficient(1, ionicStrength, TC);
      const Ksp = calculateKspFeCO3(temperatureF, pressurePsia);
      
      const TK = TC + 273.15;
      const K2 = Math.pow(10, -10.33 + 0.00057 * TC - 2900 / TK);
      const pH = 7.0; // Approximate
      const aH = Math.pow(10, -pH);
      
      const IAP = (mFe * mHCO3 * gammaFe * gammaHCO3 * K2) / aH;
      if (IAP > Ksp) {
        const ppt = mFe * (1 - Ksp / IAP);
        const rho25c = waterDensity;
        const TDS = brine.tdsMeasured ?? 0;
        maxPpt = Math.max(maxPpt, ppt * MOLAR_MASS.FeCO3 * 1000 * (rho25c - TDS / 1000000));
      }
    }
    
    // ZnCO3
    if (brine.zinc > 0 && brine.alkalinity > 0) {
      const mZn = mgLToMolality(brine.zinc, MOLAR_MASS.Zn, waterDensity);
      const mHCO3 = mgLToMolality(brine.alkalinity, MOLAR_MASS.HCO3, waterDensity);
      const ionicStrength = calculateIonicStrength(brine, waterDensity);
      const gammaZn = calculateActivityCoefficient(2, ionicStrength, TC);
      const gammaHCO3 = calculateActivityCoefficient(1, ionicStrength, TC);
      const Ksp = calculateKspZnCO3(temperatureF, pressurePsia);
      
      const TK = TC + 273.15;
      const K2 = Math.pow(10, -10.33 + 0.00057 * TC - 2900 / TK);
      const pH = 7.0; // Approximate
      const aH = Math.pow(10, -pH);
      
      const IAP = (mZn * mHCO3 * gammaZn * gammaHCO3 * K2) / aH;
      if (IAP > Ksp) {
        const ppt = mZn * (1 - Ksp / IAP);
        const rho25c = waterDensity;
        const TDS = brine.tdsMeasured ?? 0;
        maxPpt = Math.max(maxPpt, ppt * MOLAR_MASS.ZnCO3 * 1000 * (rho25c - TDS / 1000000));
      }
    }
    
    // PbS
    if (brine.lead && brine.lead > 0 && gasAcidity?.totalH2Saq && gasAcidity.totalH2Saq > 0) {
      const mPb = mgLToMolality(brine.lead, MOLAR_MASS.Pb, waterDensity);
      const mH2S = mgLToMolality(gasAcidity.totalH2Saq, MOLAR_MASS.H2S, waterDensity);
      const ionicStrength = calculateIonicStrength(brine, waterDensity);
      const gammaPb = calculateActivityCoefficient(2, ionicStrength, TC);
      const gammaS = calculateActivityCoefficient(2, ionicStrength, TC);
      const Ksp = calculateKspPbS(temperatureF, pressurePsia);
      
      const IAP = mPb * mH2S * gammaPb * gammaS;
      if (IAP > Ksp) {
        const ppt = Math.min(mPb, mH2S) * (1 - Ksp / IAP);
        const rho25c = waterDensity;
        const TDS = brine.tdsMeasured ?? 0;
        maxPpt = Math.max(maxPpt, ppt * MOLAR_MASS.PbS * 1000 * (rho25c - TDS / 1000000));
      }
    }
    
    return maxPpt;
  }

  return 0;
}

/**
 * Determine scaling status from SI
 */
function getScalingStatus(SI: number): ScaleCalculationResult['status'] {
  if (SI > 1.0) return 'Severe Scaling';
  if (SI > 0.5) return 'Moderate Scaling';
  if (SI > 0) return 'Light Scaling';
  return 'No Scaling';
}

/**
 * Main calculation function
 */
export function calculateScalePrediction(
  input: ScaleCalculationInput
): ScaleCalculationResult {
  const { mineralType, brineChemistry, gasAcidity, operatingConditions, inhibitors } = input;

  // Calculate SI at BH and WH
  let siBH: number;
  let siWH: number;
  let mineralDetails: MineralDetail[] | undefined;

  if (mineralType === 'barite') {
    siBH = calculateBariteSI(
      brineChemistry,
      operatingConditions.initialTemperature,
      operatingConditions.initialPressure,
      inhibitors
    );
    siWH = calculateBariteSI(
      brineChemistry,
      operatingConditions.finalTemperature,
      operatingConditions.finalPressure,
      inhibitors
    );
    // For barite, only one mineral
    mineralDetails = [{
      name: 'Barite',
      siBH,
      siWH,
      deltaSI: siWH - siBH,
      amountToPrecipitate: calculatePrecipitationAmount(
        mineralType,
        siWH,
        brineChemistry,
        operatingConditions.finalTemperature,
        operatingConditions.finalPressure,
        gasAcidity
      )
    }];
  } else if (mineralType === 'calcite') {
    siBH = calculateCalciteSI(
      brineChemistry,
      gasAcidity,
      operatingConditions.initialTemperature,
      operatingConditions.initialPressure,
      inhibitors
    );
    siWH = calculateCalciteSI(
      brineChemistry,
      gasAcidity,
      operatingConditions.finalTemperature,
      operatingConditions.finalPressure,
      inhibitors
    );
    // For calcite, only one mineral
    mineralDetails = [{
      name: 'Calcite',
      siBH,
      siWH,
      deltaSI: siWH - siBH,
      amountToPrecipitate: calculatePrecipitationAmount(
        mineralType,
        siWH,
        brineChemistry,
        operatingConditions.finalTemperature,
        operatingConditions.finalPressure,
        gasAcidity
      )
    }];
  } else {
    // Sulfides - Calculate detailed breakdown for all sulfide minerals
    const bhResult = calculateSulfidesSIDetailed(
      brineChemistry,
      gasAcidity,
      operatingConditions.initialTemperature,
      operatingConditions.initialPressure,
      inhibitors
    );
    const whResult = calculateSulfidesSIDetailed(
      brineChemistry,
      gasAcidity,
      operatingConditions.finalTemperature,
      operatingConditions.finalPressure,
      inhibitors
    );
    
    siBH = bhResult.maxSI;
    siWH = whResult.maxSI;
    
    // Create mineral details by matching BH and WH results
    const mineralMap = new Map<string, { siBH: number; siWH: number }>();
    
    // Collect BH results
    bhResult.details.forEach(d => {
      mineralMap.set(d.name, { siBH: d.si, siWH: 0 });
    });
    
    // Update with WH results
    whResult.details.forEach(d => {
      const existing = mineralMap.get(d.name);
      if (existing) {
        existing.siWH = d.si;
      } else {
        mineralMap.set(d.name, { siBH: 0, siWH: d.si });
      }
    });
    
    // Convert to MineralDetail array
    mineralDetails = Array.from(mineralMap.entries()).map(([name, sis]) => ({
      name,
      siBH: sis.siBH,
      siWH: sis.siWH,
      deltaSI: sis.siWH - sis.siBH,
      amountToPrecipitate: 0 // Will be calculated separately if needed
    }));
  }

  const deltaSI = siWH - siBH;
  const amountToPrecipitate = calculatePrecipitationAmount(
    mineralType,
    siWH,
    brineChemistry,
    operatingConditions.finalTemperature,
    operatingConditions.finalPressure,
    gasAcidity
  );

  return {
    mineralType,
    saturationIndex: siWH,
    deltaSI,
    amountToPrecipitate: Math.max(0, amountToPrecipitate),
    status: getScalingStatus(siWH),
    calculations: {
      bh: {
        temperature: operatingConditions.initialTemperature,
        pressure: operatingConditions.initialPressure,
        si: siBH
      },
      wh: {
        temperature: operatingConditions.finalTemperature,
        pressure: operatingConditions.finalPressure,
        si: siWH
      }
    },
    mineralDetails
  };
}

