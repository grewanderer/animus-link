import {
  type AgentModule,
  type AgentModuleMetric,
  type ArtifactsSnapshot,
  type BranchStatus,
  type CiStatus,
  type LatestRun,
  type MetricWindow,
  type MetricsSnapshot,
  type MilestoneLink,
  type MilestoneRecord,
  type MilestonesSnapshot,
  type ReplayOutcomeRecord,
  type ReplayStatus,
  type RunArtifactLink,
  type RunDetailSnapshot,
  type RunRecord,
  type RunReplayAction,
  type RunStatus,
  type RunTimelineEvent,
  type RunsSnapshot,
  type TrendPoint,
  type WorkflowStatus,
  type RegressionScore,
  type RegressionScoreComponents,
  type RegressionScoreWeights,
} from './regression-types';
import { calculateRegressionScore } from './regression-score';

export type ParseResult<T> = {
  data: T;
  issues: string[];
};

const MODULES: AgentModule[] = ['M0', 'M1', 'M2', 'M3'];
const RUN_STATUSES: RunStatus[] = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'unknown'];
const REPLAY_STATUSES: ReplayStatus[] = ['replayed', 'not_replayed', 'failed_replay', 'pending'];
const WORKFLOW_STATUSES: WorkflowStatus[] = [
  'success',
  'failure',
  'cancelled',
  'queued',
  'in_progress',
  'unknown',
];

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRunStatus(value: unknown): RunStatus {
  const parsed = asString(value);
  if (!parsed) {
    return 'unknown';
  }
  return RUN_STATUSES.includes(parsed as RunStatus) ? (parsed as RunStatus) : 'unknown';
}

function asReplayStatus(value: unknown): ReplayStatus {
  const parsed = asString(value);
  if (!parsed) {
    return 'not_replayed';
  }
  return REPLAY_STATUSES.includes(parsed as ReplayStatus)
    ? (parsed as ReplayStatus)
    : 'not_replayed';
}

function asWorkflowStatus(value: unknown): WorkflowStatus {
  const parsed = asString(value);
  if (!parsed) {
    return 'unknown';
  }
  return WORKFLOW_STATUSES.includes(parsed as WorkflowStatus)
    ? (parsed as WorkflowStatus)
    : 'unknown';
}

function asModule(value: unknown): AgentModule | undefined {
  const parsed = asString(value);
  if (!parsed) {
    return undefined;
  }
  return MODULES.includes(parsed as AgentModule) ? (parsed as AgentModule) : undefined;
}

function nonNegative(value: number | undefined, fallback = 0): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  if (value < 0) {
    return fallback;
  }
  return value;
}

function boundedPercent(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function parseTrendPoint(value: unknown): TrendPoint | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const time = asString(value.time);
  const metricValue = asNumber(value.value);
  if (!time || typeof metricValue !== 'number') {
    return undefined;
  }

  return {
    time,
    value: metricValue,
  };
}

function parseMetricWindow(value: unknown): MetricWindow {
  if (!isRecord(value)) {
    return { total: 0 };
  }

  return {
    total: nonNegative(asNumber(value.total)),
    last24h: nonNegative(asNumber(value.last24h)),
    last7d: nonNegative(asNumber(value.last7d)),
  };
}

function parseRegressionScore(value: unknown): RegressionScore {
  const fallbackComponents: RegressionScoreComponents = {
    proofBundlePct: 0,
    replaySuccessPct: 0,
    pinnedContextPct: 0,
  };

  const fallbackWeights: RegressionScoreWeights = {
    proofBundle: 0.35,
    replaySuccess: 0.35,
    pinnedContext: 0.2,
    harnessPass: 0.1,
  };

  if (!isRecord(value)) {
    const calculated = calculateRegressionScore(fallbackComponents, fallbackWeights);
    return {
      value: calculated.value,
      formula: calculated.formula,
      weights: calculated.weights,
      components: fallbackComponents,
      series: [],
    };
  }

  const componentsSource = isRecord(value.components) ? value.components : {};
  const components: RegressionScoreComponents = {
    proofBundlePct: boundedPercent(asNumber(componentsSource.proofBundlePct)),
    replaySuccessPct: boundedPercent(asNumber(componentsSource.replaySuccessPct)),
    pinnedContextPct: boundedPercent(asNumber(componentsSource.pinnedContextPct)),
    harnessPassPct: asNumber(componentsSource.harnessPassPct),
  };

  const weightsSource = isRecord(value.weights) ? value.weights : {};
  const weights: Partial<RegressionScoreWeights> = {
    proofBundle: asNumber(weightsSource.proofBundle),
    replaySuccess: asNumber(weightsSource.replaySuccess),
    pinnedContext: asNumber(weightsSource.pinnedContext),
    harnessPass: asNumber(weightsSource.harnessPass),
  };

  const calculated = calculateRegressionScore(components, weights);

  const series = asArray(value.series)
    .map(parseTrendPoint)
    .filter((item): item is TrendPoint => !!item);

  return {
    value: nonNegative(asNumber(value.value), calculated.value),
    formula: asString(value.formula) ?? calculated.formula,
    weights: calculated.weights,
    components,
    series,
  };
}

function parseBranchStatus(value: unknown): BranchStatus | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = asString(value.name);
  const lastCommitSha = asString(value.lastCommitSha);
  const lastCommitAt = asString(value.lastCommitAt);
  if (!name || !lastCommitSha || !lastCommitAt) {
    return undefined;
  }

  const ciRaw = asString(value.ciStatus);
  const ciStatus: BranchStatus['ciStatus'] =
    ciRaw === 'pass' || ciRaw === 'fail' || ciRaw === 'pending' || ciRaw === 'unknown'
      ? ciRaw
      : 'unknown';

  return {
    name,
    ahead: nonNegative(asNumber(value.ahead)),
    behind: nonNegative(asNumber(value.behind)),
    lastCommitSha,
    lastCommitAt,
    ciStatus,
    commitUrl: asString(value.commitUrl),
    compareUrl: asString(value.compareUrl),
  };
}

function parseCiStatus(value: unknown): CiStatus {
  if (!isRecord(value)) {
    return {
      workflow: 'unknown',
      conclusion: 'unknown',
      updatedAt: nowIso(),
    };
  }

  return {
    workflow: asString(value.workflow) ?? 'unknown',
    conclusion: asWorkflowStatus(value.conclusion),
    updatedAt: asString(value.updatedAt) ?? nowIso(),
    url: asString(value.url),
  };
}

function parseLatestRun(value: unknown): LatestRun | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = asString(value.id);
  const model = asString(value.model);
  const timestamp = asString(value.timestamp);
  const href = asString(value.href);
  if (!id || !model || !timestamp || !href) {
    return undefined;
  }

  return {
    id,
    model,
    timestamp,
    href,
    status: asRunStatus(value.status),
  };
}

function parseModuleBreakdown(value: unknown): AgentModuleMetric | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const moduleName = asModule(value.module);
  if (!moduleName) {
    return undefined;
  }
  return {
    module: moduleName,
    runs: nonNegative(asNumber(value.runs)),
    tokens: nonNegative(asNumber(value.tokens)),
    successRate: boundedPercent(asNumber(value.successRate)),
  };
}

export function parseMetricsSnapshot(value: unknown): ParseResult<MetricsSnapshot> {
  const issues: string[] = [];
  const source = isRecord(value) ? value : {};

  if (!isRecord(value)) {
    issues.push('metrics payload is not an object');
  }

  const tokens = parseMetricWindow(source.tokens);
  const runsWindow = parseMetricWindow(source.runs);
  const proofBundles = parseMetricWindow(source.proofBundles);
  const commitsWindow = parseMetricWindow(source.commits);
  const mergedPrs = parseMetricWindow(source.mergedPrs);

  const branchStatus = asArray(source.branchStatus)
    .map(parseBranchStatus)
    .filter((item): item is BranchStatus => !!item);

  const tokensPerRun = asArray(source.tokensPerRun)
    .map(parseTrendPoint)
    .filter((item): item is TrendPoint => !!item);
  const replayRate = asArray(source.replayRate)
    .map(parseTrendPoint)
    .filter((item): item is TrendPoint => !!item);
  const commitsPerWeek = asArray(source.commitsPerWeek)
    .map(parseTrendPoint)
    .filter((item): item is TrendPoint => !!item);

  const moduleBreakdown = asArray(source.moduleBreakdown)
    .map(parseModuleBreakdown)
    .filter((item): item is AgentModuleMetric => !!item);

  const commitsWeekly = asArray((isRecord(source.commits) ? source.commits.weekly : undefined))
    .map(parseTrendPoint)
    .filter((item): item is TrendPoint => !!item);

  const parsed: MetricsSnapshot = {
    generatedAt: asString(source.generatedAt) ?? nowIso(),
    refreshIntervalSeconds: nonNegative(asNumber(source.refreshIntervalSeconds), 20),
    sourceRepository: asString(source.sourceRepository) ?? 'unknown/unknown',
    tokens,
    runs: {
      ...runsWindow,
      replaySuccessRate7d: boundedPercent(
        asNumber(isRecord(source.runs) ? source.runs.replaySuccessRate7d : undefined),
      ),
    },
    proofBundles,
    commits: {
      ...commitsWindow,
      weekly: commitsWeekly,
    },
    mergedPrs,
    branchStatus,
    ciStatus: parseCiStatus(source.ciStatus),
    latestRun: parseLatestRun(source.latestRun),
    regressionScore: parseRegressionScore(source.regressionScore),
    tokensPerRun,
    replayRate,
    commitsPerWeek,
    moduleBreakdown: moduleBreakdown.length > 0 ? moduleBreakdown : undefined,
  };

  return {
    data: parsed,
    issues,
  };
}

function parseRunRecord(value: unknown): RunRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = asString(value.id);
  if (!id) {
    return undefined;
  }

  const timestamp =
    asString(value.timestamp) ?? asString(value.createdAt) ?? asString(value.updatedAt) ?? nowIso();

  return {
    id,
    timestamp,
    model: asString(value.model) ?? 'unknown-model',
    branch: asString(value.branch) ?? 'main',
    commitSha: asString(value.commitSha) ?? 'unknown-sha',
    tokens: nonNegative(asNumber(value.tokens)),
    status: asRunStatus(value.status),
    replayStatus: asReplayStatus(value.replayStatus),
    proofHash: asString(value.proofHash),
    proofBundleUrl: asString(value.proofBundleUrl) ?? asString(value.bundlePath),
    proofBundleSizeBytes: nonNegative(asNumber(value.proofBundleSizeBytes)),
    reproducible: asBoolean(value.reproducible) ?? Boolean(asString(value.commitSha) && asString(value.environmentLockId)),
    pinnedContext: asBoolean(value.pinnedContext) ?? Boolean(asString(value.commitSha) && asString(value.environmentLockId)),
    envLockId: asString(value.envLockId) ?? asString(value.environmentLockId),
    harnessPassed: asBoolean(value.harnessPassed),
    module: asModule(value.module),
    detailPath: asString(value.detailPath) ?? `/runs/${encodeURIComponent(id)}`,
  };
}

export function parseRunsSnapshot(value: unknown): ParseResult<RunsSnapshot> {
  const source = isRecord(value) ? value : {};
  const runs = asArray(source.runs)
    .map(parseRunRecord)
    .filter((item): item is RunRecord => !!item)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    data: {
      generatedAt: asString(source.generatedAt) ?? nowIso(),
      runs,
    },
    issues: isRecord(value) ? [] : ['runs payload is not an object'],
  };
}

function parseTimelineEvent(value: unknown): RunTimelineEvent | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const time = asString(value.time);
  const type = asString(value.type);
  const detail = asString(value.detail);
  if (!time || !type || !detail) {
    return undefined;
  }

  return {
    time,
    type,
    detail,
    source: asString(value.source),
  };
}

function parseArtifactLink(value: unknown): RunArtifactLink | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const label = asString(value.label);
  const href = asString(value.href);
  if (!label || !href) {
    return undefined;
  }

  return {
    label,
    href,
    hash: asString(value.hash),
  };
}

function parseReplayAction(value: unknown): RunReplayAction {
  if (!isRecord(value)) {
    return {
      href: '/runs',
      note: 'Replay creates a new run with explicit lineage.',
    };
  }

  return {
    href: asString(value.href) ?? '/runs',
    note: asString(value.note) ?? 'Replay creates a new run with explicit lineage.',
  };
}

export function parseRunDetailSnapshot(value: unknown): ParseResult<RunDetailSnapshot | undefined> {
  if (!isRecord(value)) {
    return { data: undefined, issues: ['run detail payload is not an object'] };
  }

  const run = parseRunRecord(value.run);
  if (!run) {
    return { data: undefined, issues: ['run detail payload is missing run context'] };
  }

  const timeline = asArray(value.timeline)
    .map(parseTimelineEvent)
    .filter((item): item is RunTimelineEvent => !!item);

  const artifacts = asArray(value.artifacts)
    .map(parseArtifactLink)
    .filter((item): item is RunArtifactLink => !!item);

  return {
    data: {
      run,
      timeline,
      artifacts,
      replay: parseReplayAction(value.replay),
      warnings: asArray(value.warnings).filter((item): item is string => typeof item === 'string'),
    },
    issues: [],
  };
}

function parseProofBundle(value: unknown): ArtifactsSnapshot['proofBundles'][number] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const hash = asString(value.hash);
  const runId = asString(value.runId);
  const timestamp = asString(value.timestamp);
  const bundleUrl = asString(value.bundleUrl);
  const verification = asString(value.verification);

  if (!hash || !runId || !timestamp || !bundleUrl || !verification) {
    return undefined;
  }

  return {
    hash,
    runId,
    sizeBytes: nonNegative(asNumber(value.sizeBytes)),
    timestamp,
    bundleUrl,
    verification,
  };
}

function parseReplayOutcome(value: unknown): ReplayOutcomeRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const sourceRunId = asString(value.sourceRunId);
  const timestamp = asString(value.timestamp);
  if (!sourceRunId || !timestamp) {
    return undefined;
  }

  return {
    sourceRunId,
    replayRunId: asString(value.replayRunId),
    status: asRunStatus(value.status),
    timestamp,
    durationSeconds: nonNegative(asNumber(value.durationSeconds)),
    note: asString(value.note),
  };
}

export function parseArtifactsSnapshot(value: unknown): ParseResult<ArtifactsSnapshot> {
  const source = isRecord(value) ? value : {};

  const proofBundles = asArray(source.proofBundles)
    .map(parseProofBundle)
    .filter((item): item is ArtifactsSnapshot['proofBundles'][number] => !!item);

  const replayOutcomes = asArray(source.replayOutcomes)
    .map(parseReplayOutcome)
    .filter((item): item is ReplayOutcomeRecord => !!item);

  return {
    data: {
      generatedAt: asString(source.generatedAt) ?? nowIso(),
      formatPolicyNote:
        asString(source.formatPolicyNote) ??
        'Validate hash and format metadata before using any proof bundle.',
      proofBundles,
      replayOutcomes,
    },
    issues: isRecord(value) ? [] : ['artifacts payload is not an object'],
  };
}

function parseMilestoneLink(value: unknown): MilestoneLink | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const label = asString(value.label);
  const href = asString(value.href);
  if (!label || !href) {
    return undefined;
  }
  return { label, href };
}

function parseMilestone(value: unknown): MilestoneRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = asString(value.id);
  const date = asString(value.date);
  const title = asString(value.title);
  const summary = asString(value.summary);
  if (!id || !date || !title || !summary) {
    return undefined;
  }

  const typeRaw = asString(value.type);
  const type: MilestoneRecord['type'] =
    typeRaw === 'merge' || typeRaw === 'replay' || typeRaw === 'release' || typeRaw === 'note'
      ? typeRaw
      : 'note';

  const links = asArray(value.links)
    .map(parseMilestoneLink)
    .filter((item): item is MilestoneLink => !!item);

  return {
    id,
    cycle: nonNegative(asNumber(value.cycle)),
    type,
    date,
    title,
    summary,
    links: links.length > 0 ? links : undefined,
  };
}

export function parseMilestonesSnapshot(value: unknown): ParseResult<MilestonesSnapshot> {
  const source = isRecord(value) ? value : {};

  const cycleSource = isRecord(source.cycle) ? source.cycle : {};
  const milestones = asArray(source.milestones)
    .map(parseMilestone)
    .filter((item): item is MilestoneRecord => !!item)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    data: {
      generatedAt: asString(source.generatedAt) ?? nowIso(),
      cycle: {
        current: nonNegative(asNumber(cycleSource.current)),
        target: nonNegative(asNumber(cycleSource.target), 999),
      },
      milestones,
    },
    issues: isRecord(value) ? [] : ['milestones payload is not an object'],
  };
}
