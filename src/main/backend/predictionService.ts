import NodeCache from 'node-cache';
import { randomUUID } from 'crypto';
import { PredictionInput, PredictionResult } from '../../common/types';
import { loadHistory, persistResult } from './storage';

const CACHE_TTL_SECONDS = 60 * 30; // 30 minutes per machine

export class PredictionService {
  private cache = new NodeCache({ stdTTL: CACHE_TTL_SECONDS, checkperiod: 120 });

  runPrediction(input: PredictionInput): PredictionResult {
    const cacheKey = JSON.stringify(input);
    const cached = this.cache.get<PredictionResult>(cacheKey);

    if (cached) {
      return { ...cached, cacheHit: true };
    }

    const result = this.computeSaraProjection(input);
    this.cache.set(cacheKey, result);
    persistResult(result);

    return result;
  }

  getHistory(): PredictionResult[] {
    return loadHistory();
  }

  clearCache() {
    this.cache.flushAll();
  }

  private computeSaraProjection(input: PredictionInput): PredictionResult {
    const { saraProfile, context } = input;
    const totalSara =
      saraProfile.saturates +
        saraProfile.aromatics +
        saraProfile.resins +
        saraProfile.asphaltenes || 1;

    const normalized = {
      saturates: saraProfile.saturates / totalSara,
      aromatics: saraProfile.aromatics / totalSara,
      resins: saraProfile.resins / totalSara,
      asphaltenes: saraProfile.asphaltenes / totalSara
    };

    const resolveCongealMultiplier = (pourPointF: number | null, onSiteF: number | null) => {
      if (pourPointF === null && onSiteF === null) {
        return 1.2;
      }
      if (onSiteF !== null && pourPointF === null) {
        return onSiteF > 60 ? 0.248 : 1.2;
      }
      if (onSiteF === null && pourPointF !== null) {
        return 1.2;
      }
      if (onSiteF !== null && pourPointF !== null) {
        return onSiteF > pourPointF ? 0.248 : 1.2;
      }
      return 1.2;
    };

    const effectivePourPointF =
      context.pourPointF !== null
        ? context.pourPointF
        : context.onSiteTemperatureF !== null
          ? 60
          : 60;

    const congealMultiplier = resolveCongealMultiplier(context.pourPointF, context.onSiteTemperatureF);

    const congealRatio = (() => {
      const denominator = saraProfile.aromatics + saraProfile.resins;
      if (denominator <= 0) {
        return Number.POSITIVE_INFINITY;
      }
      const base = (saraProfile.saturates + saraProfile.asphaltenes) / denominator;
      return Number.isFinite(base) ? base * congealMultiplier : base;
    })();

    const pourPointC = (effectivePourPointF - 32) * (5 / 9);
    const viscosityValue = context.viscosity ?? 0;
    const waxValue = context.waxDeposit ?? 0;
    const viscosityFactor = Math.log10(Math.max(viscosityValue, 1) + 1);
    const waxFraction = Math.max(0, waxValue) / 100;

    // Handle Infinity case untuk congealRatio
    const congealRatioForStability = Number.isFinite(congealRatio) ? congealRatio : 100; // Cap at 100 untuk perhitungan

    const stabilityBase =
      92 -
      congealRatioForStability * 28 -
      waxFraction * 45 -
      viscosityFactor * 18 +
      normalized.aromatics * 24 -
      normalized.asphaltenes * 20;

    const stabilityIndex = Number(
      Math.max(0, Math.min(100, Number.isFinite(stabilityBase) ? stabilityBase : 0)).toFixed(2)
    );

    const crystallizationTime = Number(
      Math.max(
        1.5,
        Math.min(
          36,
          6.5 +
            viscosityFactor * 4.8 +
            waxFraction * 10 +
            congealRatioForStability * 6 -
            normalized.aromatics * 2.3 +
            normalized.resins * 1.4
        )
      ).toFixed(2)
    );

    const pourPoint = Number(
      Math.max(
        -45,
        Math.min(
          35,
          pourPointC +
            waxFraction * 22 -
            normalized.aromatics * 6 +
            normalized.asphaltenes * 5
        )
      ).toFixed(2)
    );

    const recommendations: string[] = [];

    if (congealRatio >= 1) {
      recommendations.push(
        'Congeal ratio exceeds 1.0. Reduce saturates or asphaltenes and increase aromatics/resins immediately.'
      );
    } else if (congealRatio >= 0.6) {
      recommendations.push(
        'Congeal ratio is trending upward. Increase aromatic or resin content to improve dispersion stability.'
      );
    }

    if (stabilityIndex < 45) {
      recommendations.push(
        'Stability is low. Adjust blend toward higher aromatics/resins and reduce wax deposition risk.'
      );
    } else if (stabilityIndex > 75) {
      recommendations.push('High stability achieved. Maintain the current process window.');
    }

    if (crystallizationTime > 18) {
      recommendations.push(
        'Crystallization is slow. Evaluate viscosity reducers or increase agitation in the system.'
      );
    } else if (crystallizationTime < 6) {
      recommendations.push(
        'Crystallization is fast. Lower wax deposition or increase resin content to moderate crystal formation.'
      );
    }

    if (pourPoint > 15) {
      recommendations.push('Pour point is high. Blend with lower pour-point feed or adjust wax handling.');
    } else if (pourPoint < -20) {
      recommendations.push('Pour point is low. There may be excess saturates—rebalance the blend.');
    }

    if ((context.waxDeposit ?? 0) > 8) {
      recommendations.push('Wax deposition above 8%. Deploy wax inhibitors or schedule mechanical pigging.');
    }
    if ((context.viscosity ?? 0) > 600) {
      recommendations.push('Viscosity is elevated. Consider heating or diluent injection to improve flow.');
    }

    if (!recommendations.length) {
      recommendations.push('Parameters are in the optimal zone. Save this Sparco Labs setup.');
    }

    return {
      id: randomUUID(),
      stabilityIndex,
      crystallizationTime,
      pourPoint,
      cacheHit: false,
      recommendations,
      timestamp: new Date().toISOString(),
      input
    };
  }
}

