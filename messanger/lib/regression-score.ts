import type { RegressionScoreComponents, RegressionScoreWeights } from './regression-types';

const DEFAULT_WEIGHTS: RegressionScoreWeights = {
  proofBundle: 0.35,
  replaySuccess: 0.35,
  pinnedContext: 0.2,
  harnessPass: 0.1,
};

function boundedPercent(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

function positiveOrZero(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 0;
  }
  return value;
}

export function normalizeRegressionWeights(
  weights: Partial<RegressionScoreWeights> | undefined,
  includeHarness: boolean,
): RegressionScoreWeights {
  const candidate: RegressionScoreWeights = {
    proofBundle: positiveOrZero(weights?.proofBundle ?? DEFAULT_WEIGHTS.proofBundle),
    replaySuccess: positiveOrZero(weights?.replaySuccess ?? DEFAULT_WEIGHTS.replaySuccess),
    pinnedContext: positiveOrZero(weights?.pinnedContext ?? DEFAULT_WEIGHTS.pinnedContext),
    harnessPass: positiveOrZero(weights?.harnessPass ?? DEFAULT_WEIGHTS.harnessPass),
  };

  if (!includeHarness) {
    candidate.harnessPass = 0;
  }

  const total =
    candidate.proofBundle +
    candidate.replaySuccess +
    candidate.pinnedContext +
    candidate.harnessPass;

  if (total <= 0) {
    const fallback = includeHarness ? DEFAULT_WEIGHTS : { ...DEFAULT_WEIGHTS, harnessPass: 0 };
    const fallbackTotal = fallback.proofBundle + fallback.replaySuccess + fallback.pinnedContext + fallback.harnessPass;
    return {
      proofBundle: fallback.proofBundle / fallbackTotal,
      replaySuccess: fallback.replaySuccess / fallbackTotal,
      pinnedContext: fallback.pinnedContext / fallbackTotal,
      harnessPass: fallback.harnessPass / fallbackTotal,
    };
  }

  return {
    proofBundle: candidate.proofBundle / total,
    replaySuccess: candidate.replaySuccess / total,
    pinnedContext: candidate.pinnedContext / total,
    harnessPass: candidate.harnessPass / total,
  };
}

export function calculateRegressionScore(
  components: RegressionScoreComponents,
  weights?: Partial<RegressionScoreWeights>,
): { value: number; formula: string; weights: RegressionScoreWeights } {
  const includeHarness = typeof components.harnessPassPct === 'number';
  const normalized = normalizeRegressionWeights(weights, includeHarness);

  const proofBundle = boundedPercent(components.proofBundlePct);
  const replaySuccess = boundedPercent(components.replaySuccessPct);
  const pinnedContext = boundedPercent(components.pinnedContextPct);
  const harnessPass = includeHarness ? boundedPercent(components.harnessPassPct) : 0;

  const value =
    proofBundle * normalized.proofBundle +
    replaySuccess * normalized.replaySuccess +
    pinnedContext * normalized.pinnedContext +
    harnessPass * normalized.harnessPass;

  const formula =
    `score = (${proofBundle.toFixed(1)} * ${normalized.proofBundle.toFixed(2)}) + ` +
    `(${replaySuccess.toFixed(1)} * ${normalized.replaySuccess.toFixed(2)}) + ` +
    `(${pinnedContext.toFixed(1)} * ${normalized.pinnedContext.toFixed(2)})` +
    (includeHarness
      ? ` + (${harnessPass.toFixed(1)} * ${normalized.harnessPass.toFixed(2)})`
      : '');

  return {
    value: Math.round(value * 10) / 10,
    formula,
    weights: normalized,
  };
}
