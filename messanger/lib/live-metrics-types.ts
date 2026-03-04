export type LiveTrendPoint = {
  time: string;
  value: number;
};

export type CycleWindow = '24h' | '7d';

export type WorkflowConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'queued'
  | 'in_progress'
  | 'unknown';

export type TokensAggregate = {
  updatedAt: string;
  tokensTotal: number;
  tokens24h: number;
  tokens7d: number;
  source: string;
  tokenBudget24h?: number;
  tokenBudget7d?: number;
};

export type RepositoryDescriptor = {
  owner: string;
  name: string;
  fullName: string;
  url: string;
};

export type BranchHealth = {
  name: string;
  commitSha: string;
  committedAt: string;
  status: 'success' | 'failure' | 'pending' | 'unknown';
  commitUrl?: string;
};

export type WorkflowHealth = {
  workflow: string;
  conclusion: WorkflowConclusion;
  createdAt: string;
  updatedAt: string;
  latestSuccessDurationSeconds?: number;
  url?: string;
};

export type ReleaseSnapshot = {
  tag: string;
  publishedAt: string;
  url: string;
};

export type ObservatoryWindowStats = {
  tokens: number;
  previousTokens?: number;
  commits: number;
  previousCommits: number;
  mergedPrs: number;
  previousMergedPrs: number;
  workflowRuns: number;
  workflowSuccessRate?: number;
  previousWorkflowSuccessRate?: number;
  medianWorkflowDurationSeconds?: number;
  previousMedianWorkflowDurationSeconds?: number;
  brokenMainMinutes?: number;
  brokenMainReason?: 'ok' | 'insufficient_data' | 'open_failure';
  medianPrLeadTimeHours?: number;
  previousMedianPrLeadTimeHours?: number;
  latestConclusions: WorkflowConclusion[];
};

export type ObservatoryConfig = {
  tokensFreshnessMaxHours: number;
  tokenBudget24h: number;
  tokenBudget7d: number;
  workflowTargetDurationSeconds: number;
  prLeadTimeTargetHours: number;
};

export type ObservatorySnapshot = {
  githubReachable: boolean;
  tokensSchemaValid: boolean;
  tokensFresh: boolean;
  tokensAgeHours: number;
  windows: Record<CycleWindow, ObservatoryWindowStats>;
  config: ObservatoryConfig;
};

export type LiveMetricsSnapshot = {
  generatedAt: string;
  refreshIntervalSeconds: number;
  repository: RepositoryDescriptor;
  tokens: TokensAggregate;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  openPullRequests: number;
  mergedPullRequests7d: number;
  commits7d: number;
  branch: BranchHealth;
  ci: WorkflowHealth;
  latestRelease?: ReleaseSnapshot;
  observatory: ObservatorySnapshot;
  commitWeeklyTrend: LiveTrendPoint[];
  mergedPrDailyTrend: LiveTrendPoint[];
  issues: string[];
};

export type TokensAggregateFile = {
  updated_at: string;
  tokens_total: number;
  tokens_24h: number;
  tokens_7d: number;
  source: string;
};
