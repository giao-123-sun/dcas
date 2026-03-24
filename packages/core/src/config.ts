export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface DCASConfig {
  prediction: {
    recalibrateEmaWeight: number;
    minStd: number;
    ensembleDisagreementPenalty: number;
  };
  objective: {
    maxTradeoffShift: number;
  };
  simulation: {
    riskBestCaseMultiplier: number;
    riskWorstCaseMultiplier: number;
  };
  learning: {
    smallDeviationThreshold: number;
    largeDeviationThreshold: number;
    minSamplesForBiasDetection: number;
    biasDirectionThreshold: number;
  };
  pattern: {
    maxExamples: number;
    reinforceRate: number;
    maxConfidence: number;
  };
  controller: {
    criticalScoreThreshold: number;
  };
  metaclaw: {
    feedbackDeviationThreshold: number;
    lowQualityRewardThreshold: number;
  };
}

export const DEFAULT_CONFIG: DCASConfig = {
  prediction: {
    recalibrateEmaWeight: 0.8,
    minStd: 0.01,
    ensembleDisagreementPenalty: 1.0,
  },
  objective: {
    maxTradeoffShift: 0.1,
  },
  simulation: {
    riskBestCaseMultiplier: 1.2,
    riskWorstCaseMultiplier: 0.7,
  },
  learning: {
    smallDeviationThreshold: 0.05,
    largeDeviationThreshold: 0.15,
    minSamplesForBiasDetection: 3,
    biasDirectionThreshold: 0.7,
  },
  pattern: {
    maxExamples: 10,
    reinforceRate: 0.1,
    maxConfidence: 0.99,
  },
  controller: {
    criticalScoreThreshold: 0.3,
  },
  metaclaw: {
    feedbackDeviationThreshold: 0.1,
    lowQualityRewardThreshold: 0.5,
  },
};

export function mergeConfig(partial: DeepPartial<DCASConfig>): DCASConfig {
  const result = structuredClone(DEFAULT_CONFIG) as DCASConfig;
  function deepMerge(target: any, source: any) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  deepMerge(result, partial);
  return result;
}
