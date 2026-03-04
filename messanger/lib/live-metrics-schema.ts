import type {
  CycleWindow,
  LiveMetricsSnapshot,
  LiveTrendPoint,
  ObservatoryWindowStats,
  WorkflowConclusion,
  TokensAggregate,
  TokensAggregateFile,
} from '@/lib/live-metrics-types';

export type ParseResult<T> = {
  data: T;
  issues: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/_/g, '');
    if (!normalized) {
      return undefined;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = parseFiniteNumber(value);
  if (typeof parsed !== 'number') {
    return fallback;
  }
  return parsed;
}

function nonNegative(value: number) {
  return Math.max(0, value);
}

function asOptionalNumber(value: unknown) {
  return parseFiniteNumber(value);
}

function asWorkflowConclusion(value: unknown): WorkflowConclusion {
  const normalized = asString(value);
  if (
    normalized === 'success' ||
    normalized === 'failure' ||
    normalized === 'cancelled' ||
    normalized === 'queued' ||
    normalized === 'in_progress'
  ) {
    return normalized;
  }
  return 'unknown';
}

function parseConclusions(value: unknown): WorkflowConclusion[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => asWorkflowConclusion(item));
}

function parseWindowStats(value: unknown): ObservatoryWindowStats {
  const record = asRecord(value);

  return {
    tokens: nonNegative(asNumber(record?.tokens)),
    previousTokens: asOptionalNumber(record?.previousTokens),
    commits: nonNegative(asNumber(record?.commits)),
    previousCommits: nonNegative(asNumber(record?.previousCommits)),
    mergedPrs: nonNegative(asNumber(record?.mergedPrs)),
    previousMergedPrs: nonNegative(asNumber(record?.previousMergedPrs)),
    workflowRuns: nonNegative(asNumber(record?.workflowRuns)),
    workflowSuccessRate: asOptionalNumber(record?.workflowSuccessRate),
    previousWorkflowSuccessRate: asOptionalNumber(record?.previousWorkflowSuccessRate),
    medianWorkflowDurationSeconds: asOptionalNumber(record?.medianWorkflowDurationSeconds),
    previousMedianWorkflowDurationSeconds: asOptionalNumber(
      record?.previousMedianWorkflowDurationSeconds,
    ),
    brokenMainMinutes: asOptionalNumber(record?.brokenMainMinutes),
    brokenMainReason:
      asString(record?.brokenMainReason) === 'ok' ||
      asString(record?.brokenMainReason) === 'insufficient_data' ||
      asString(record?.brokenMainReason) === 'open_failure'
        ? (asString(record?.brokenMainReason) as 'ok' | 'insufficient_data' | 'open_failure')
        : undefined,
    medianPrLeadTimeHours: asOptionalNumber(record?.medianPrLeadTimeHours),
    previousMedianPrLeadTimeHours: asOptionalNumber(record?.previousMedianPrLeadTimeHours),
    latestConclusions: parseConclusions(record?.latestConclusions),
  };
}

function asTrendPoint(value: unknown): LiveTrendPoint | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const time = asString(record.time);
  if (!time) {
    return undefined;
  }

  return {
    time,
    value: nonNegative(asNumber(record.value)),
  };
}

function asIsoDate(value: unknown): string | undefined {
  const numericCandidate = parseFiniteNumber(value);
  if (typeof numericCandidate === 'number') {
    const absValue = Math.abs(numericCandidate);
    const ms = absValue < 1e12 ? numericCandidate * 1000 : numericCandidate;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const raw = asString(value);
  if (!raw) {
    return undefined;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function firstFiniteNumber(
  record: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const parsed = parseFiniteNumber(record[key]);
    if (typeof parsed === 'number') {
      return nonNegative(parsed);
    }
  }
  return undefined;
}

function sumTokenLikeFields(record: Record<string, unknown> | undefined): number | undefined {
  if (!record) {
    return undefined;
  }
  let sum = 0;
  let count = 0;
  for (const [key, value] of Object.entries(record)) {
    if (!key.toLowerCase().includes('token')) {
      continue;
    }
    const parsed = parseFiniteNumber(value);
    if (typeof parsed === 'number') {
      sum += parsed;
      count += 1;
    }
  }
  if (count === 0) {
    return undefined;
  }
  return nonNegative(sum);
}

function extractSnapshotTotal(record: Record<string, unknown>): number | undefined {
  const direct = firstFiniteNumber(record, [
    'tokens_total',
    'total_tokens',
    'token_total',
    'total',
    'tokens',
    'usage_tokens',
  ]);
  if (typeof direct === 'number') {
    return direct;
  }

  const nestedUsage =
    asRecord(record.usage) ??
    asRecord(record.totals) ??
    asRecord(record.metrics) ??
    asRecord(record.summary);

  const nestedDirect = firstFiniteNumber(nestedUsage, [
    'tokens_total',
    'total_tokens',
    'token_total',
    'total',
    'tokens',
    'usage_tokens',
  ]);
  if (typeof nestedDirect === 'number') {
    return nestedDirect;
  }

  const composedPromptCompletion = firstFiniteNumber(record, ['prompt_tokens', 'input_tokens']);
  const composedCompletion = firstFiniteNumber(record, ['completion_tokens', 'output_tokens']);
  if (typeof composedPromptCompletion === 'number' && typeof composedCompletion === 'number') {
    return nonNegative(composedPromptCompletion + composedCompletion);
  }

  const nestedPromptCompletion = firstFiniteNumber(nestedUsage, ['prompt_tokens', 'input_tokens']);
  const nestedCompletion = firstFiniteNumber(nestedUsage, ['completion_tokens', 'output_tokens']);
  if (typeof nestedPromptCompletion === 'number' && typeof nestedCompletion === 'number') {
    return nonNegative(nestedPromptCompletion + nestedCompletion);
  }

  const tokenLike = sumTokenLikeFields(nestedUsage) ?? sumTokenLikeFields(record);
  return typeof tokenLike === 'number' ? tokenLike : undefined;
}

function computeWindowFromSnapshots(
  samples: Array<{ timeMs: number; total: number }>,
  latestTimeMs: number,
  windowMs: number,
): number {
  if (samples.length === 0) {
    return 0;
  }

  const monotonicDrops = samples.reduce((acc, sample, index) => {
    if (index === 0) {
      return 0;
    }
    return sample.total + 1e-9 < samples[index - 1].total ? acc + 1 : acc;
  }, 0);
  const monotonic = monotonicDrops <= Math.floor(samples.length * 0.2);
  const windowStart = latestTimeMs - windowMs;

  if (monotonic) {
    const latest = samples[samples.length - 1]?.total ?? 0;
    const previous = [...samples]
      .reverse()
      .find((sample) => sample.timeMs <= windowStart)?.total;
    if (typeof previous === 'number') {
      return nonNegative(latest - previous);
    }
    return nonNegative(latest);
  }

  return nonNegative(
    samples
      .filter((sample) => sample.timeMs > windowStart && sample.timeMs <= latestTimeMs)
      .reduce((acc, sample) => acc + sample.total, 0),
  );
}

function sumEventWindow(
  samples: Array<{ timeMs: number; tokens: number }>,
  latestTimeMs: number,
  windowMs: number,
) {
  const windowStart = latestTimeMs - windowMs;
  return nonNegative(
    samples
      .filter((sample) => sample.timeMs > windowStart && sample.timeMs <= latestTimeMs)
      .reduce((acc, sample) => acc + sample.tokens, 0),
  );
}

export function parseTokensAggregateFile(value: unknown): ParseResult<TokensAggregate> {
  const issues: string[] = [];
  const recordFromObject = asRecord(value);
  const rootSnapshots = Array.isArray(value) ? value : undefined;
  const record = recordFromObject ?? {};

  if (!recordFromObject && !rootSnapshots) {
    issues.push('tokens payload is not an object');
    return {
      issues,
      data: {
        updatedAt: nowIso(),
        tokensTotal: 0,
        tokens24h: 0,
        tokens7d: 0,
        source: 'unavailable',
      },
    };
  }

  const payload = record as Partial<TokensAggregateFile>;
  const aggregateShapeDetected =
    typeof payload.tokens_total === 'number' ||
    typeof payload.tokens_24h === 'number' ||
    typeof payload.tokens_7d === 'number';

  const tokenBudget24h = firstFiniteNumber(record, [
    'token_budget_24h',
    'tokens_budget_24h',
    'budget_24h',
  ]);
  const tokenBudget7d = firstFiniteNumber(record, [
    'token_budget_7d',
    'tokens_budget_7d',
    'budget_7d',
  ]);

  if (aggregateShapeDetected) {
    const data: TokensAggregate = {
      updatedAt: asString(payload.updated_at, nowIso()),
      tokensTotal: nonNegative(asNumber(payload.tokens_total)),
      tokens24h: nonNegative(asNumber(payload.tokens_24h)),
      tokens7d: nonNegative(asNumber(payload.tokens_7d)),
      source: asString(payload.source, 'unknown'),
      tokenBudget24h,
      tokenBudget7d,
    };
    return { data, issues };
  }

  const snapshotsRaw =
    rootSnapshots ??
    (Array.isArray(record.snapshots) ? record.snapshots : undefined) ??
    (Array.isArray(record.items) ? record.items : undefined);

  if (!Array.isArray(snapshotsRaw)) {
    issues.push('tokens payload has unsupported shape');
    return {
      issues,
      data: {
        updatedAt: nowIso(),
        tokensTotal: 0,
        tokens24h: 0,
        tokens7d: 0,
        source: asString(record.source, 'unknown'),
        tokenBudget24h,
        tokenBudget7d,
      },
    };
  }

  const parsedSamples = snapshotsRaw
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => !!item)
    .map((item) => {
      const explicitTotal = firstFiniteNumber(item, [
        'tokens_total',
        'total_tokens',
        'token_total',
        'usage_tokens',
      ]);
      const directTokens = firstFiniteNumber(item, ['tokens', 'token_count']);
      const total = typeof explicitTotal === 'number' ? explicitTotal : extractSnapshotTotal(item);
      const timestamp =
        asIsoDate(item.timestamp) ??
        asIsoDate(item.at) ??
        asIsoDate(item.captured_at) ??
        asIsoDate(item.created_at) ??
        asIsoDate(item.updated_at) ??
        asIsoDate(item.date) ??
        asIsoDate(item.time);
      const tokens24h = firstFiniteNumber(item, ['tokens_24h', 'total_24h']);
      const tokens7d = firstFiniteNumber(item, ['tokens_7d', 'total_7d']);
      const budget24h = firstFiniteNumber(item, ['token_budget_24h', 'tokens_budget_24h', 'budget_24h']);
      const budget7d = firstFiniteNumber(item, ['token_budget_7d', 'tokens_budget_7d', 'budget_7d']);
      return {
        timestamp,
        total,
        directTokens,
        source: asString(item.source),
        hasRunId: Boolean(asString(item.run_id) || asString(item.runId)),
        tokens24h,
        tokens7d,
        budget24h,
        budget7d,
      };
    })
    .filter((item) => item.timestamp && typeof item.total === 'number')
    .map((item) => ({
      ...item,
      timeMs: new Date(item.timestamp!).getTime(),
    }))
    .filter((item) => Number.isFinite(item.timeMs))
    .sort((a, b) => a.timeMs - b.timeMs);

  if (parsedSamples.length === 0) {
    issues.push('tokens snapshots are empty or invalid');
    return {
      issues,
      data: {
        updatedAt: nowIso(),
        tokensTotal: 0,
        tokens24h: 0,
        tokens7d: 0,
        source: asString(record.source, 'snapshot'),
        tokenBudget24h,
        tokenBudget7d,
      },
    };
  }

  const latest = parsedSamples[parsedSamples.length - 1]!;
  const totals = parsedSamples.map((item) => ({
    timeMs: item.timeMs,
    total: item.total!,
  }));
  const eventSamples = parsedSamples.map((item) => ({
    timeMs: item.timeMs,
    tokens:
      typeof item.directTokens === 'number'
        ? item.directTokens
        : typeof item.total === 'number'
          ? item.total
          : 0,
  }));
  const latestTotal = nonNegative(latest.total || 0);
  const drops = totals.reduce((acc, sample, index) => {
    if (index === 0) {
      return acc;
    }
    return sample.total + 1e-9 < totals[index - 1]!.total ? acc + 1 : acc;
  }, 0);
  const dropMagnitude = totals.reduce((acc, sample, index) => {
    if (index === 0) {
      return acc;
    }
    const previous = totals[index - 1]!.total;
    return sample.total < previous ? acc + (previous - sample.total) : acc;
  }, 0);
  const hasRunIds = parsedSamples.some((item) => item.hasRunId);
  const useEventMode =
    hasRunIds || (drops > 0 && dropMagnitude > Math.max(1, latestTotal * 0.1));

  const derived24h = useEventMode
    ? sumEventWindow(eventSamples, latest.timeMs, 24 * 60 * 60 * 1000)
    : computeWindowFromSnapshots(totals, latest.timeMs, 24 * 60 * 60 * 1000);
  const derived7d = useEventMode
    ? sumEventWindow(eventSamples, latest.timeMs, 7 * 24 * 60 * 60 * 1000)
    : computeWindowFromSnapshots(totals, latest.timeMs, 7 * 24 * 60 * 60 * 1000);
  const derivedTotal = useEventMode
    ? eventSamples.reduce((acc, item) => acc + item.tokens, 0)
    : latestTotal;
  const snapshotBudget24h = [...parsedSamples].reverse().find((item) => typeof item.budget24h === 'number')?.budget24h;
  const snapshotBudget7d = [...parsedSamples].reverse().find((item) => typeof item.budget7d === 'number')?.budget7d;
  const snapshotSource = [...parsedSamples].reverse().find((item) => item.source)?.source;

  return {
    issues,
    data: {
      updatedAt: latest.timestamp || nowIso(),
      tokensTotal: nonNegative(derivedTotal),
      tokens24h: typeof latest.tokens24h === 'number' ? latest.tokens24h : derived24h,
      tokens7d: typeof latest.tokens7d === 'number' ? latest.tokens7d : derived7d,
      source: asString(record.source, snapshotSource || 'snapshot'),
      tokenBudget24h: tokenBudget24h ?? snapshotBudget24h,
      tokenBudget7d: tokenBudget7d ?? snapshotBudget7d,
    },
  };
}

export function parseLiveMetricsSnapshot(value: unknown): ParseResult<LiveMetricsSnapshot> {
  const issues: string[] = [];
  const record = asRecord(value);

  if (!record) {
    issues.push('metrics payload is not an object');
  }

  const repository = asRecord(record?.repository);
  const branch = asRecord(record?.branch);
  const ci = asRecord(record?.ci);
  const tokens = asRecord(record?.tokens);
  const latestRelease = asRecord(record?.latestRelease);
  const observatory = asRecord(record?.observatory);
  const observatoryWindows = asRecord(observatory?.windows);
  const observatoryConfig = asRecord(observatory?.config);

  const commitWeeklyTrend = Array.isArray(record?.commitWeeklyTrend)
    ? record?.commitWeeklyTrend.map(asTrendPoint).filter((item): item is LiveTrendPoint => !!item)
    : [];
  const mergedPrDailyTrend = Array.isArray(record?.mergedPrDailyTrend)
    ? record?.mergedPrDailyTrend.map(asTrendPoint).filter((item): item is LiveTrendPoint => !!item)
    : [];

  const parsed: LiveMetricsSnapshot = {
    generatedAt: asString(record?.generatedAt, nowIso()),
    refreshIntervalSeconds: Math.max(60, asNumber(record?.refreshIntervalSeconds, 60)),
    repository: {
      owner: asString(repository?.owner, ''),
      name: asString(repository?.name, ''),
      fullName: asString(repository?.fullName, ''),
      url: asString(repository?.url, ''),
    },
    tokens: {
      updatedAt: asString(tokens?.updatedAt, nowIso()),
      tokensTotal: nonNegative(asNumber(tokens?.tokensTotal)),
      tokens24h: nonNegative(asNumber(tokens?.tokens24h)),
      tokens7d: nonNegative(asNumber(tokens?.tokens7d)),
      source: asString(tokens?.source, 'unknown'),
    },
    stars: nonNegative(asNumber(record?.stars)),
    forks: nonNegative(asNumber(record?.forks)),
    watchers: nonNegative(asNumber(record?.watchers)),
    openIssues: nonNegative(asNumber(record?.openIssues)),
    openPullRequests: nonNegative(asNumber(record?.openPullRequests)),
    mergedPullRequests7d: nonNegative(asNumber(record?.mergedPullRequests7d)),
    commits7d: nonNegative(asNumber(record?.commits7d)),
    branch: {
      name: asString(branch?.name, 'unknown'),
      commitSha: asString(branch?.commitSha, ''),
      committedAt: asString(branch?.committedAt, nowIso()),
      status:
        asString(branch?.status) === 'success' ||
        asString(branch?.status) === 'failure' ||
        asString(branch?.status) === 'pending'
          ? (asString(branch?.status) as 'success' | 'failure' | 'pending')
          : 'unknown',
      commitUrl: asString(branch?.commitUrl),
    },
    ci: {
      workflow: asString(ci?.workflow, 'unknown'),
      conclusion: asWorkflowConclusion(ci?.conclusion),
      createdAt: asString(ci?.createdAt, nowIso()),
      updatedAt: asString(ci?.updatedAt, nowIso()),
      latestSuccessDurationSeconds: asOptionalNumber(ci?.latestSuccessDurationSeconds),
      url: asString(ci?.url),
    },
    latestRelease:
      latestRelease && asString(latestRelease.tag)
        ? {
            tag: asString(latestRelease.tag),
            publishedAt: asString(latestRelease.publishedAt, nowIso()),
            url: asString(latestRelease.url),
          }
        : undefined,
    observatory: {
      githubReachable: Boolean(observatory?.githubReachable),
      tokensSchemaValid:
        typeof observatory?.tokensSchemaValid === 'boolean' ? observatory.tokensSchemaValid : true,
      tokensFresh: typeof observatory?.tokensFresh === 'boolean' ? observatory.tokensFresh : true,
      tokensAgeHours: nonNegative(asNumber(observatory?.tokensAgeHours)),
      windows: (['24h', '7d'] as CycleWindow[]).reduce(
        (acc, key) => {
          acc[key] = parseWindowStats(observatoryWindows?.[key]);
          return acc;
        },
        {} as Record<CycleWindow, ObservatoryWindowStats>,
      ),
      config: {
        tokensFreshnessMaxHours: Math.max(1, asNumber(observatoryConfig?.tokensFreshnessMaxHours, 24)),
        tokenBudget24h: nonNegative(asNumber(observatoryConfig?.tokenBudget24h, 0)),
        tokenBudget7d: nonNegative(asNumber(observatoryConfig?.tokenBudget7d, 0)),
        workflowTargetDurationSeconds: Math.max(
          1,
          asNumber(observatoryConfig?.workflowTargetDurationSeconds, 1800),
        ),
        prLeadTimeTargetHours: Math.max(1, asNumber(observatoryConfig?.prLeadTimeTargetHours, 24)),
      },
    },
    commitWeeklyTrend,
    mergedPrDailyTrend,
    issues: Array.isArray(record?.issues)
      ? record?.issues.filter((item): item is string => typeof item === 'string')
      : [],
  };

  if (!parsed.repository.fullName) {
    issues.push('repository metadata is missing');
  }

  return {
    data: {
      ...parsed,
      issues: parsed.issues.length > 0 ? parsed.issues : issues,
    },
    issues,
  };
}
