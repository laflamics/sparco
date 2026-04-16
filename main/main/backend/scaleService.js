"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScaleService = void 0;
const EMPIRICAL_CONSTANT = 39343.62617498425;
const PTB_MULTIPLIER_SIMPLE = 254.8043358946213;
const PTB_MULTIPLIER_ODDO = 166.3;
const MOLAR_MASS = {
    sodium: 22.989769,
    calcium: 40.078,
    magnesium: 24.305,
    chloride: 35.453,
    carbonate: 60.0089,
    bicarbonate: 61.0168,
    sulfate: 96.06
};
const VALENCE = {
    sodium: 1,
    calcium: 2,
    magnesium: 2,
    chloride: -1,
    carbonate: -2,
    bicarbonate: -1,
    sulfate: -2
};
const ION_SIZE = {
    calcium: 6,
    carbonate: 4.5
};
class ScaleService {
    calculate(input) {
        if (input.method === 'stiffDavis') {
            return this.calculateEmpirical(input);
        }
        if (input.method === 'oddoTomson') {
            return this.calculateOddoTomson(input);
        }
        throw new Error(`Unknown method: ${input.method}`);
    }
    calculateEmpirical(input) {
        if (input.calcium <= 0 || input.bicarbonate <= 0) {
            return {
                method: input.method,
                saturationIndex: Number.NEGATIVE_INFINITY,
                amountScale: 0,
                status: 'No Scaling / Corrosion Likely'
            };
        }
        const siRaw = Math.log10((input.calcium * input.bicarbonate) / EMPIRICAL_CONSTANT);
        const saturationIndex = Math.round(siRaw * 10000) / 10000;
        const amountScale = Math.round(PTB_MULTIPLIER_SIMPLE * saturationIndex * 10000) / 10000;
        let status;
        if (saturationIndex > 1) {
            status = 'Severe Scaling Occurs';
        }
        else if (saturationIndex > 0.5) {
            status = 'Moderate Scaling';
        }
        else if (saturationIndex > 0) {
            status = 'Light Scaling';
        }
        else {
            status = 'No Scaling / Corrosion Likely';
        }
        return {
            method: input.method,
            saturationIndex,
            amountScale,
            status
        };
    }
    calculateOddoTomson(input) {
        const temperatureC = input.temperature ?? 25;
        const ph = input.ph ?? 7;
        const concentrations = {
            sodium: this.mgPerLToMolPerL(input.sodium ?? 0, MOLAR_MASS.sodium),
            calcium: this.mgPerLToMolPerL(input.calcium, MOLAR_MASS.calcium),
            magnesium: this.mgPerLToMolPerL(input.magnesium ?? 0, MOLAR_MASS.magnesium),
            chloride: this.mgPerLToMolPerL(input.chloride ?? 0, MOLAR_MASS.chloride),
            carbonate: this.mgPerLToMolPerL(input.carbonate ?? 0, MOLAR_MASS.carbonate),
            bicarbonate: this.mgPerLToMolPerL(input.bicarbonate, MOLAR_MASS.bicarbonate),
            sulfate: this.mgPerLToMolPerL(input.sulfate ?? 0, MOLAR_MASS.sulfate)
        };
        let carbonateMol = concentrations.carbonate;
        if (carbonateMol <= 0) {
            carbonateMol = this.deriveCarbonate(concentrations.bicarbonate, ph, temperatureC);
        }
        const adjustedConcentrations = { ...concentrations, carbonate: carbonateMol };
        const ionicStrength = this.calculateIonicStrength(adjustedConcentrations);
        const gammaCa = this.activityCoefficient(2, ION_SIZE.calcium, ionicStrength, temperatureC);
        const gammaCo3 = this.activityCoefficient(2, ION_SIZE.carbonate, ionicStrength, temperatureC);
        const iap = concentrations.calcium * gammaCa * carbonateMol * gammaCo3;
        const ksp = this.calciteKsp(temperatureC);
        const saturationIndexRaw = Math.log10(iap / ksp);
        const saturationIndex = parseFloat(saturationIndexRaw.toFixed(9));
        const amountScale = parseFloat((PTB_MULTIPLIER_ODDO * saturationIndexRaw).toFixed(7));
        let status;
        if (saturationIndex > 1) {
            status = 'Severe Scaling Occurs';
        }
        else if (saturationIndex > 0.5) {
            status = 'Moderate Scaling';
        }
        else if (saturationIndex > 0) {
            status = 'Light Scaling';
        }
        else {
            status = 'No Scaling / Corrosion Likely';
        }
        return {
            method: input.method,
            saturationIndex,
            amountScale,
            status
        };
    }
    mgPerLToMolPerL(value, molarMass) {
        return value <= 0 ? 0 : value / (molarMass * 1000);
    }
    calculateIonicStrength(concentrations) {
        let sum = 0;
        Object.keys(concentrations).forEach((key) => {
            const concentration = concentrations[key];
            const charge = VALENCE[key];
            sum += concentration * charge * charge;
        });
        return 0.5 * sum;
    }
    activityCoefficient(charge, ionSize, ionicStrength, temperatureC) {
        if (ionicStrength <= 0) {
            return 1;
        }
        const temperatureK = temperatureC + 273.15;
        const A = 0.5085 - 0.00028 * (temperatureC - 25);
        const B = 0.3281 - 0.0001 * (temperatureC - 25);
        const sqrtI = Math.sqrt(ionicStrength);
        const term = (-A * charge * charge * sqrtI) / (1 + B * ionSize * sqrtI);
        return Math.pow(10, term + 0.3 * A * charge * charge * ionicStrength);
    }
    deriveCarbonate(bicarbonateMol, ph, temperatureC) {
        const temperatureK = temperatureC + 273.15;
        const pK2 = 10.33 - 0.00057 * temperatureC + 2900 / temperatureK;
        const K2 = Math.pow(10, -pK2);
        const hPlus = Math.pow(10, -ph);
        const result = (K2 * bicarbonateMol) / hPlus;
        return result > 0 ? result : 0;
    }
    calciteKsp(temperatureC) {
        const temperatureK = temperatureC + 273.15;
        const log10Ksp = -171.9065 -
            0.077993 * temperatureC +
            2839.319 / temperatureK +
            71.595 * Math.log10(temperatureK);
        return Math.pow(10, log10Ksp);
    }
}
exports.ScaleService = ScaleService;
