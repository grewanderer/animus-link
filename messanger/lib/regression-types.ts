export type RunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'unknown';

export type ReplayStatus = 'replayed' | 'not_replayed' | 'failed_replay' | 'pending';

export type AgentModule = 'M0' | 'M1' | 'M2' | 'M3';

export type TrendPoint = {
  time: string;
  value: number;
};

export type MetricWindow = {
  total: number;
  last24h?: number;
  last7d?: number;
};

export type RegressionScoreWeights = {
  proofBundle: number;
  replaySuccess: number;
  pinnedContext: number;
  harnessPass: number;
};

export type RegressionScoreComponents = {
  proofBundlePct: number;
  replaySuccessPct: number;
  pinnedContextPct: number;
  harnessPassPct?: number;
};

export type RegressionScore = {
  value: number;
  formula: string;
  weights: RegressionScoreWeights;
  components: RegressionScoreComponents;
  series: TrendPoint[];
};

export type BranchStatus = {
  name: string;
  ahead: number;
  behind: number;
  lastCommitSha: string;
  lastCommitAt: string;
  ciStatus: 'pass' | 'fail' | 'pending' | 'unknown';
  commitUrl?: string;
  compareUrl?: string;
};

export type WorkflowStatus =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'queued'
  | 'in_progress'
  | 'unknown';

export type CiStatus = {
  workflow: string;
  conclusion: WorkflowStatus;
  updatedAt: string;
  url?: string;
};

export type LatestRun = {
  id: string;
  model: string;
  timestamp: string;
  href: string;
  status: RunStatus;
};

export type AgentModuleMetric = {
  module: AgentModule;
  runs: number;
  tokens: number;
  successRate: number;
};

export type MetricsSnapshot = {
  generatedAt: string;
  refreshIntervalSeconds: number;
  sourceRepository: string;
  tokens: MetricWindow;
  runs: MetricWindow & {
    replaySuccessRate7d: number;
  };
  proofBundles: MetricWindow;
  commits: MetricWindow & {
    weekly: TrendPoint[];
  };
  mergedPrs: MetricWindow;
  branchStatus: BranchStatus[];
  ciStatus: CiStatus;
  latestRun?: LatestRun;
  regressionScore: RegressionScore;
  tokensPerRun: TrendPoint[];
  replayRate: TrendPoint[];
  commitsPerWeek: TrendPoint[];
  moduleBreakdown?: AgentModuleMetric[];
};

export type RunRecord = {
  id: string;
  timestamp: string;
  model: string;
  branch: string;
  commitSha: string;
  tokens: number;
  status: RunStatus;
  replayStatus: ReplayStatus;
  proofHash?: string;
  proofBundleUrl?: string;
  proofBundleSizeBytes?: number;
  reproducible: boolean;
  pinnedContext: boolean;
  envLockId?: string;
  harnessPassed?: boolean;
  module?: AgentModule;
  detailPath: string;
};

export type RunsSnapshot = {
  generatedAt: string;
  runs: RunRecord[];
};

export type RunTimelineEvent = {
  time: string;
  type: string;
  detail: string;
  source?: string;
};

export type RunArtifactLink = {
  label: string;
  href: string;
  hash?: string;
};

export type RunReplayAction = {
  href: string;
  note: string;
};

export type RunDetailSnapshot = {
  run: RunRecord;
  timeline: RunTimelineEvent[];
  artifacts: RunArtifactLink[];
  replay: RunReplayAction;
  warnings: string[];
};

export type ProofBundleRecord = {
  hash: string;
  runId: string;
  sizeBytes: number;
  timestamp: string;
  bundleUrl: string;
  verification: string;
};

export type ReplayOutcomeRecord = {
  sourceRunId: string;
  replayRunId?: string;
  status: RunStatus;
  timestamp: string;
  durationSeconds?: number;
  note?: string;
};

export type ArtifactsSnapshot = {
  generatedAt: string;
  formatPolicyNote: string;
  proofBundles: ProofBundleRecord[];
  replayOutcomes: ReplayOutcomeRecord[];
};

export type MilestoneLink = {
  label: string;
  href: string;
};

export type MilestoneRecord = {
  id: string;
  cycle: number;
  type: 'merge' | 'replay' | 'release' | 'note';
  date: string;
  title: string;
  summary: string;
  links?: MilestoneLink[];
};

export type MilestonesSnapshot = {
  generatedAt: string;
  cycle: {
    current: number;
    target: number;
  };
  milestones: MilestoneRecord[];
};
