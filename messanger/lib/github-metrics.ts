import { unstable_cache } from 'next/cache';

import { parseTokensAggregateFile } from '@/lib/live-metrics-schema';
import type {
  CycleWindow,
  LiveMetricsSnapshot,
  LiveTrendPoint,
  WorkflowConclusion,
  TokensAggregate,
} from '@/lib/live-metrics-types';
import { regressionRepo } from '@/lib/regression-repo';

type RepoConfig = {
  owner: string;
  name: string;
};

type TokensConfig = {
  owner: string;
  name: string;
  path: string;
  ref: string;
};

type BranchSourcesConfig = {
  metricsBranch: string;
  releaseBranch: string;
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type RepositoryGraphqlPayload = {
  repository: {
    name: string;
    nameWithOwner: string;
    url: string;
    stargazerCount: number;
    forkCount: number;
    watchers: { totalCount: number };
    issues: { totalCount: number };
    pullRequests: { totalCount: number };
    mergedPullRequests: {
      totalCount: number;
      nodes: Array<{ mergedAt: string | null; createdAt: string | null }>;
    };
    metricsBranchRef:
      | {
          name: string;
          target: {
            oid: string;
            committedDate: string;
            url?: string;
            statusCheckRollup?: { state?: string | null } | null;
            commits24h: { totalCount: number };
            commits48h: { totalCount: number };
            commits7d: { totalCount: number };
            commits14d: { totalCount: number };
          };
        }
      | null;
  } | null;
};

type WorkflowRunsPayload = {
  workflow_runs?: Array<{
    id?: number;
    name?: string;
    display_title?: string;
    status?: string;
    conclusion?: string | null;
    created_at?: string;
    run_started_at?: string;
    updated_at?: string;
    html_url?: string;
  }>;
};

type CommitActivityWeek = {
  week: number;
  total: number;
};

type RepositoryRestPayload = {
  full_name?: string;
  html_url?: string;
  name?: string;
  stargazers_count?: number;
  forks_count?: number;
  subscribers_count?: number;
  default_branch?: string;
};

type SearchCountPayload = {
  total_count?: number;
};

type CommitRecordPayload = {
  sha?: string;
  html_url?: string;
  commit?: {
    committer?: {
      date?: string;
    };
  };
};

type ReleaseRecordPayload = {
  tag_name?: string;
  published_at?: string;
  html_url?: string;
  target_commitish?: string;
  draft?: boolean;
};

type GithubContentResponse = {
  content?: string;
  encoding?: string;
  download_url?: string;
};

const GITHUB_API = 'https://api.github.com';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';
const BASE_GITHUB_REFRESH_INTERVAL_SECONDS = Math.max(
  15,
  Number.parseInt(process.env.METRICS_REFRESH_SECONDS || '60', 10) || 60,
);
const GITHUB_REFRESH_INTERVAL_SECONDS = githubToken()
  ? BASE_GITHUB_REFRESH_INTERVAL_SECONDS
  : Math.max(BASE_GITHUB_REFRESH_INTERVAL_SECONDS, 600);
const TOKENS_REFRESH_INTERVAL_SECONDS = Math.max(
  15,
  Number.parseInt(process.env.TOKENS_REFRESH_SECONDS || '60', 10) || 60,
);
const CLIENT_REFRESH_INTERVAL_SECONDS = Math.max(
  15,
  Number.parseInt(process.env.METRICS_CLIENT_REFRESH_SECONDS || '60', 10) || 60,
);
const FALLBACK_TOKENS: TokensAggregate = {
  updatedAt: new Date().toISOString(),
  tokensTotal: 0,
  tokens24h: 0,
  tokens7d: 0,
  source: 'unavailable',
};

let tokensEtagCache: {
  etag?: string;
  value?: TokensAggregate;
  fetchedAt: number;
} = { fetchedAt: 0 };
const restEtagCache = new Map<
  string,
  {
    etag?: string;
    value?: unknown;
    fetchedAt: number;
  }
>();
let lastSuccessfulSnapshot: LiveMetricsSnapshot | undefined;

function normalizePath(pathname: string) {
  return pathname
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function githubToken() {
  return process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
}

function githubHeaders(extra: Record<string, string> = {}) {
  const token = githubToken();
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'kapakka-landing-metrics',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function githubRawHeaders(extra: Record<string, string> = {}) {
  const token = githubToken();
  return {
    'User-Agent': 'kapakka-landing-metrics',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function resolveRepoConfig(): RepoConfig {
  const owner = process.env.GITHUB_REPO_OWNER?.trim() || regressionRepo.owner;
  const name = process.env.GITHUB_REPO_NAME?.trim() || regressionRepo.repo;

  return { owner, name };
}

function resolveTokensConfig(repo: RepoConfig): TokensConfig {
  const normalizedOwner = process.env.TOKENS_REPO_OWNER?.trim();
  const normalizedName = process.env.TOKENS_REPO_NAME?.trim();
  const normalizedOwnerLc = normalizedOwner?.toLowerCase();
  const normalizedNameLc = normalizedName?.toLowerCase();
  const owner =
    normalizedOwner && !['your-org', 'example-org', 'owner'].includes(normalizedOwnerLc || '')
      ? normalizedOwner
      : repo.owner;
  const name =
    normalizedName && !['your-repo', 'repo'].includes(normalizedNameLc || '')
      ? normalizedName
      : repo.name;
  return {
    owner,
    name,
    path: process.env.TOKENS_FILE_PATH?.trim() || 'metrics/token_usage_snapshots.json',
    ref: process.env.TOKENS_FILE_REF?.trim() || 'main-work',
  };
}

function normalizeBranchName(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().replace(/^refs\/heads\//, '');
  return normalized || fallback;
}

function toQualifiedBranchRef(branchName: string) {
  if (branchName.startsWith('refs/heads/')) {
    return branchName;
  }
  return `refs/heads/${branchName}`;
}

function resolveBranchSourcesConfig(): BranchSourcesConfig {
  return {
    metricsBranch: normalizeBranchName(process.env.GITHUB_METRICS_BRANCH, 'main-work'),
    releaseBranch: normalizeBranchName(process.env.GITHUB_RELEASE_BRANCH, 'main'),
  };
}

async function fetchGraphql<T>(query: string, variables: Record<string, unknown>) {
  const response = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      ...githubHeaders({
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }),
    },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: GITHUB_REFRESH_INTERVAL_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL failed with status ${response.status}`);
  }

  const payload = (await response.json()) as GraphqlResponse<T>;
  if (payload.errors && payload.errors.length > 0) {
    const messages = payload.errors.map((item) => item.message || 'unknown').join('; ');
    throw new Error(`GitHub GraphQL errors: ${messages}`);
  }
  if (!payload.data) {
    throw new Error('GitHub GraphQL returned empty data');
  }
  return payload.data;
}

async function fetchJson<T>(url: string): Promise<T | undefined> {
  const now = Date.now();
  const cached = restEtagCache.get(url);
  if (
    typeof cached?.value !== 'undefined' &&
    now - cached.fetchedAt < GITHUB_REFRESH_INTERVAL_SECONDS * 1000
  ) {
    return cached.value as T;
  }

  const response = await fetch(url, {
    headers: githubHeaders(cached?.etag ? { 'If-None-Match': cached.etag } : {}),
    next: { revalidate: GITHUB_REFRESH_INTERVAL_SECONDS },
  });

  if (response.status === 304 && typeof cached?.value !== 'undefined') {
    restEtagCache.set(url, {
      ...cached,
      fetchedAt: now,
    });
    return cached.value as T;
  }

  if (!response.ok) {
    if (typeof cached?.value !== 'undefined') {
      return cached.value as T;
    }
    return undefined;
  }

  const payload = (await response.json()) as T;
  restEtagCache.set(url, {
    etag: response.headers.get('etag') ?? cached?.etag,
    value: payload,
    fetchedAt: now,
  });
  return payload;
}

async function fetchRestFallback(repo: RepoConfig, sinceIso: string, metricsBranch: string) {
  const repository = await fetchJson<RepositoryRestPayload>(`${GITHUB_API}/repos/${repo.owner}/${repo.name}`);
  if (!repository) {
    return undefined;
  }

  const branchName = metricsBranch || repository.default_branch || 'main';
  const searchPrUrl = `${GITHUB_API}/search/issues?q=${encodeURIComponent(`repo:${repo.owner}/${repo.name} type:pr state:open`)}`;
  const searchIssueUrl = `${GITHUB_API}/search/issues?q=${encodeURIComponent(`repo:${repo.owner}/${repo.name} type:issue state:open`)}`;

  const [openPrs, openIssues, commits7d, branchCommit] = await Promise.all([
    fetchJson<SearchCountPayload>(searchPrUrl),
    fetchJson<SearchCountPayload>(searchIssueUrl),
    fetchJson<CommitRecordPayload[]>(
      `${GITHUB_API}/repos/${repo.owner}/${repo.name}/commits?sha=${encodeURIComponent(branchName)}&since=${encodeURIComponent(sinceIso)}&per_page=100`,
    ),
    fetchJson<CommitRecordPayload>(
      `${GITHUB_API}/repos/${repo.owner}/${repo.name}/commits/${encodeURIComponent(branchName)}`,
    ),
  ]);

  return {
    repository,
    branchName,
    openPrs: openPrs?.total_count || 0,
    openIssues: openIssues?.total_count || 0,
    commits7d: Array.isArray(commits7d) ? commits7d.length : 0,
    branchCommit,
  };
}

function statusFromRollup(value?: string | null) {
  if (!value) {
    return 'unknown';
  }
  const lowered = value.toLowerCase();
  if (lowered === 'success') {
    return 'success';
  }
  if (lowered === 'failure' || lowered === 'error') {
    return 'failure';
  }
  if (lowered === 'pending' || lowered === 'queued' || lowered === 'in_progress') {
    return 'pending';
  }
  return 'unknown';
}

function normalizeWorkflowConclusion(value?: string | null): WorkflowConclusion {
  if (value === 'success') return 'success';
  if (value === 'failure') return 'failure';
  if (value === 'cancelled') return 'cancelled';
  if (value === 'queued') return 'queued';
  if (value === 'in_progress') return 'in_progress';
  return 'unknown';
}

type TimeWindowRange = {
  key: CycleWindow;
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
};

function createWindowRange(now: Date, key: CycleWindow): TimeWindowRange {
  const durationMs = key === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const end = new Date(now);
  const start = new Date(now.getTime() - durationMs);
  const previousEnd = new Date(start);
  const previousStart = new Date(previousEnd.getTime() - durationMs);
  return { key, start, end, previousStart, previousEnd };
}

function isWithin(dateValue: string | undefined, start: Date, end: Date) {
  if (!dateValue) {
    return false;
  }
  const point = new Date(dateValue).getTime();
  if (!Number.isFinite(point)) {
    return false;
  }
  return point >= start.getTime() && point < end.getTime();
}

function median(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

type NormalizedWorkflowRun = {
  id: number;
  conclusion: WorkflowConclusion;
  createdAt?: string;
  startedAt?: string;
  updatedAt?: string;
  durationSeconds?: number;
  url?: string;
};

function normalizeWorkflowRuns(runs: WorkflowRunsPayload['workflow_runs']): NormalizedWorkflowRun[] {
  if (!Array.isArray(runs)) {
    return [];
  }

  return runs.map((run, index) => {
    const createdAt = run.created_at;
    const startedAt = run.run_started_at;
    const updatedAt = run.updated_at;
    const startedMs = startedAt ? new Date(startedAt).getTime() : Number.NaN;
    const updatedMs = updatedAt ? new Date(updatedAt).getTime() : Number.NaN;
    const durationSeconds =
      Number.isFinite(startedMs) && Number.isFinite(updatedMs) && updatedMs >= startedMs
        ? Math.round((updatedMs - startedMs) / 1000)
        : undefined;

    return {
      id: run.id ?? index,
      conclusion:
        normalizeWorkflowConclusion(run.conclusion) === 'unknown'
          ? normalizeWorkflowConclusion(run.status)
          : normalizeWorkflowConclusion(run.conclusion),
      createdAt,
      startedAt,
      updatedAt,
      durationSeconds,
      url: run.html_url,
    };
  });
}

function computeWorkflowWindowStats(runs: NormalizedWorkflowRun[], range: TimeWindowRange) {
  const currentRuns = runs.filter((run) => isWithin(run.createdAt, range.start, range.end));
  const previousRuns = runs.filter((run) =>
    isWithin(run.createdAt, range.previousStart, range.previousEnd),
  );

  const currentCompleted = currentRuns.filter(
    (run) => run.conclusion !== 'queued' && run.conclusion !== 'in_progress',
  );
  const previousCompleted = previousRuns.filter(
    (run) => run.conclusion !== 'queued' && run.conclusion !== 'in_progress',
  );

  const currentSuccess = currentCompleted.filter((run) => run.conclusion === 'success').length;
  const previousSuccess = previousCompleted.filter((run) => run.conclusion === 'success').length;

  const currentDurations = currentCompleted
    .map((run) => run.durationSeconds)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const previousDurations = previousCompleted
    .map((run) => run.durationSeconds)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  const sortedByUpdated = currentCompleted
    .filter((run) => !!run.updatedAt)
    .slice()
    .sort((a, b) => new Date(a.updatedAt!).getTime() - new Date(b.updatedAt!).getTime());

  let brokenStart: number | null = null;
  let brokenMinutes = 0;
  let brokenMainReason: 'ok' | 'insufficient_data' | 'open_failure' = 'ok';

  for (const run of sortedByUpdated) {
    const updatedMs = new Date(run.updatedAt!).getTime();
    if (!Number.isFinite(updatedMs)) {
      brokenMainReason = 'insufficient_data';
      continue;
    }

    if (run.conclusion === 'failure' && brokenStart === null) {
      brokenStart = updatedMs;
      continue;
    }

    if (run.conclusion === 'success' && brokenStart !== null) {
      brokenMinutes += Math.max(0, (updatedMs - brokenStart) / (1000 * 60));
      brokenStart = null;
    }
  }

  if (brokenStart !== null) {
    brokenMinutes += Math.max(0, (range.end.getTime() - brokenStart) / (1000 * 60));
    brokenMainReason = 'open_failure';
  }

  const recentConclusions = currentRuns
    .slice(0, 20)
    .map((run) => run.conclusion)
    .filter((value): value is WorkflowConclusion => !!value);

  return {
    workflowRuns: currentCompleted.length,
    workflowSuccessRate:
      currentCompleted.length > 0 ? (currentSuccess / currentCompleted.length) * 100 : undefined,
    previousWorkflowSuccessRate:
      previousCompleted.length > 0 ? (previousSuccess / previousCompleted.length) * 100 : undefined,
    medianWorkflowDurationSeconds: median(currentDurations),
    previousMedianWorkflowDurationSeconds: median(previousDurations),
    brokenMainMinutes:
      brokenMainReason === 'insufficient_data' ? undefined : Math.round(Math.max(0, brokenMinutes)),
    brokenMainReason,
    latestConclusions: recentConclusions,
  };
}

function computeMergedPrWindowStats(
  nodes: Array<{ mergedAt: string | null; createdAt?: string | null }>,
  range: TimeWindowRange,
) {
  const current = nodes.filter((item) =>
    item.mergedAt ? isWithin(item.mergedAt, range.start, range.end) : false,
  );
  const previous = nodes.filter((item) =>
    item.mergedAt ? isWithin(item.mergedAt, range.previousStart, range.previousEnd) : false,
  );

  const currentLeadTimes = current
    .map((item) => {
      if (!item.createdAt || !item.mergedAt) {
        return undefined;
      }
      const created = new Date(item.createdAt).getTime();
      const merged = new Date(item.mergedAt).getTime();
      if (!Number.isFinite(created) || !Number.isFinite(merged) || merged < created) {
        return undefined;
      }
      return (merged - created) / (1000 * 60 * 60);
    })
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  const previousLeadTimes = previous
    .map((item) => {
      if (!item.createdAt || !item.mergedAt) {
        return undefined;
      }
      const created = new Date(item.createdAt).getTime();
      const merged = new Date(item.mergedAt).getTime();
      if (!Number.isFinite(created) || !Number.isFinite(merged) || merged < created) {
        return undefined;
      }
      return (merged - created) / (1000 * 60 * 60);
    })
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    mergedPrs: current.length,
    previousMergedPrs: previous.length,
    medianPrLeadTimeHours: median(currentLeadTimes),
    previousMedianPrLeadTimeHours: median(previousLeadTimes),
  };
}

function formatDayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildMergedPrDailyTrend(nodes: Array<{ mergedAt: string | null }>, days = 14): LiveTrendPoint[] {
  const buckets = new Map<string, number>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - offset);
    buckets.set(formatDayKey(day), 0);
  }

  for (const node of nodes) {
    if (!node.mergedAt) {
      continue;
    }
    const mergedDate = new Date(node.mergedAt);
    if (Number.isNaN(mergedDate.getTime())) {
      continue;
    }
    const key = formatDayKey(mergedDate);
    if (!buckets.has(key)) {
      continue;
    }
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  return Array.from(buckets.entries()).map(([time, value]) => ({ time, value }));
}

function buildCommitWeeklyTrend(weeks: CommitActivityWeek[] | undefined): LiveTrendPoint[] {
  if (!weeks || weeks.length === 0) {
    return [];
  }

  return weeks
    .slice(-8)
    .map((week) => ({
      time: formatDayKey(new Date(week.week * 1000)),
      value: Math.max(0, Number(week.total) || 0),
    }))
    .filter((point) => point.time);
}

function normalizeCommitish(value: string | undefined) {
  if (!value) {
    return '';
  }
  return value.trim().replace(/^refs\/heads\//, '');
}

function releaseMatchesBranch(release: ReleaseRecordPayload, branch: string) {
  const target = normalizeCommitish(release.target_commitish);
  const targetBranch = normalizeCommitish(branch);
  return !!target && target === targetBranch;
}

async function fetchLatestReleaseForBranch(repo: RepoConfig, releaseBranch: string) {
  const releases = await fetchJson<ReleaseRecordPayload[]>(
    `${GITHUB_API}/repos/${repo.owner}/${repo.name}/releases?per_page=20`,
  );
  if (!Array.isArray(releases) || releases.length === 0) {
    return undefined;
  }

  const nonDraftReleases = releases.filter((release) => !release.draft);
  const candidates = nonDraftReleases.length > 0 ? nonDraftReleases : releases;
  const selected =
    candidates.find((release) => releaseMatchesBranch(release, releaseBranch)) ?? candidates[0];
  if (!selected?.tag_name || !selected.published_at || !selected.html_url) {
    return undefined;
  }

  return {
    tag: selected.tag_name,
    publishedAt: selected.published_at,
    url: selected.html_url,
  };
}

async function fetchTokensAggregate(tokensConfig: TokensConfig): Promise<TokensAggregate> {
  const now = Date.now();
  const cachedValue = tokensEtagCache.value;
  if (cachedValue && now - tokensEtagCache.fetchedAt < TOKENS_REFRESH_INTERVAL_SECONDS * 1000) {
    return cachedValue;
  }

  const rawRef = tokensConfig.ref
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const rawUrl = `https://raw.githubusercontent.com/${tokensConfig.owner}/${tokensConfig.name}/${rawRef}/${normalizePath(tokensConfig.path)}`;
  const cachedEtagHeader: Record<string, string> = {};
  if (tokensEtagCache.etag) {
    cachedEtagHeader['If-None-Match'] = tokensEtagCache.etag;
  }

  const parseTokenText = (rawText: string): TokensAggregate | undefined => {
    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(rawText) as unknown;
    } catch {
      try {
        parsedRaw = rawText
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line) as unknown);
      } catch {
        return undefined;
      }
    }
    return parseTokensAggregateFile(parsedRaw).data;
  };

  const rawResponse = await fetch(rawUrl, {
    headers: githubRawHeaders(cachedEtagHeader),
    next: { revalidate: TOKENS_REFRESH_INTERVAL_SECONDS },
  });

  const cachedAfterRaw = tokensEtagCache.value;
  if (rawResponse.status === 304 && cachedAfterRaw) {
    tokensEtagCache = {
      ...tokensEtagCache,
      fetchedAt: now,
    };
    return cachedAfterRaw;
  }

  if (rawResponse.ok) {
    const parsed = parseTokenText(await rawResponse.text());
    if (parsed) {
      tokensEtagCache = {
        etag: rawResponse.headers.get('etag') ?? tokensEtagCache.etag,
        fetchedAt: now,
        value: parsed,
      };
      return parsed;
    }
  }

  const endpoint = `${GITHUB_API}/repos/${tokensConfig.owner}/${tokensConfig.name}/contents/${normalizePath(tokensConfig.path)}?ref=${encodeURIComponent(tokensConfig.ref)}`;

  const response = await fetch(endpoint, {
    headers: githubHeaders(cachedEtagHeader),
    next: { revalidate: TOKENS_REFRESH_INTERVAL_SECONDS },
  });

  const cachedAfterContents = tokensEtagCache.value;
  if (response.status === 304 && cachedAfterContents) {
    tokensEtagCache = {
      ...tokensEtagCache,
      fetchedAt: now,
    };
    return cachedAfterContents;
  }

  if (!response.ok) {
    const cachedOnFailure = tokensEtagCache.value;
    if (cachedOnFailure) {
      tokensEtagCache = {
        ...tokensEtagCache,
        fetchedAt: now,
      };
      return cachedOnFailure;
    }
    return {
      ...FALLBACK_TOKENS,
      source: 'unavailable',
    };
  }

  const payload = (await response.json()) as GithubContentResponse;
  let decoded = '';
  if (payload.content && payload.encoding === 'base64') {
    decoded = Buffer.from(payload.content, 'base64').toString('utf8');
  } else {
    const fallbackRawUrl =
      payload.download_url || rawUrl;
    const rawResponse = await fetch(fallbackRawUrl, {
      headers: githubRawHeaders(),
      next: { revalidate: TOKENS_REFRESH_INTERVAL_SECONDS },
    });
    if (!rawResponse.ok) {
      const cachedOnRawFailure = tokensEtagCache.value;
      if (cachedOnRawFailure) {
        tokensEtagCache = {
          ...tokensEtagCache,
          fetchedAt: now,
        };
        return cachedOnRawFailure;
      }
      return {
        ...FALLBACK_TOKENS,
        source: 'invalid',
      };
    }
    decoded = await rawResponse.text();
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(decoded) as unknown;
  } catch {
    try {
      parsedRaw = decoded
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as unknown);
    } catch {
      const cachedOnParseFailure = tokensEtagCache.value;
      if (cachedOnParseFailure) {
        tokensEtagCache = {
          ...tokensEtagCache,
          fetchedAt: now,
        };
        return cachedOnParseFailure;
      }
      return {
        ...FALLBACK_TOKENS,
        source: 'invalid-json',
      };
    }
  }

  const parsed = parseTokensAggregateFile(parsedRaw);
  const etag = response.headers.get('etag') ?? undefined;
  tokensEtagCache = {
    etag,
    fetchedAt: now,
    value: parsed.data,
  };
  return parsed.data;
}

async function collectLiveMetricsSnapshot(): Promise<LiveMetricsSnapshot> {
  const issues: string[] = [];
  const repo = resolveRepoConfig();
  const tokensRepo = resolveTokensConfig(repo);
  const branchSources = resolveBranchSourcesConfig();
  const now = new Date();
  const since7d = new Date(now);
  since7d.setUTCDate(since7d.getUTCDate() - 7);

  const query = `
    query RepoDashboard(
      $owner: String!
      $name: String!
      $since24h: GitTimestamp!
      $since48h: GitTimestamp!
      $since7d: GitTimestamp!
      $since14d: GitTimestamp!
      $metricsBranchRef: String!
    ) {
      repository(owner: $owner, name: $name) {
        name
        nameWithOwner
        url
        stargazerCount
        forkCount
        watchers {
          totalCount
        }
        issues(states: OPEN) {
          totalCount
        }
        pullRequests(states: OPEN) {
          totalCount
        }
        mergedPullRequests: pullRequests(
          states: MERGED
          first: 100
          orderBy: { field: UPDATED_AT, direction: DESC }
        ) {
          totalCount
          nodes {
            mergedAt
            createdAt
          }
        }
        metricsBranchRef: ref(qualifiedName: $metricsBranchRef) {
          name
          target {
            ... on Commit {
              oid
              committedDate
              url
              statusCheckRollup {
                state
              }
              commits24h: history(first: 1, since: $since24h) {
                totalCount
              }
              commits48h: history(first: 1, since: $since48h) {
                totalCount
              }
              commits7d: history(first: 1, since: $since7d) {
                totalCount
              }
              commits14d: history(first: 1, since: $since14d) {
                totalCount
              }
            }
          }
        }
      }
    }
  `;

  const [graphqlData, workflowRunsByBranch, commitActivity, tokens, latestRelease] = await Promise.all([
    fetchGraphql<RepositoryGraphqlPayload>(query, {
      owner: repo.owner,
      name: repo.name,
      since24h: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      since48h: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      since7d: since7d.toISOString(),
      since14d: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      metricsBranchRef: toQualifiedBranchRef(branchSources.metricsBranch),
    }).catch((error) => {
      issues.push(error instanceof Error ? error.message : String(error));
      return undefined;
    }),
    fetchJson<WorkflowRunsPayload>(
      `${GITHUB_API}/repos/${repo.owner}/${repo.name}/actions/runs?per_page=100&branch=${encodeURIComponent(branchSources.metricsBranch)}`,
    ),
    fetchJson<CommitActivityWeek[]>(
      `${GITHUB_API}/repos/${repo.owner}/${repo.name}/stats/commit_activity`,
    ),
    fetchTokensAggregate(tokensRepo).catch((error) => {
      issues.push(error instanceof Error ? error.message : String(error));
      return FALLBACK_TOKENS;
    }),
    fetchLatestReleaseForBranch(repo, branchSources.releaseBranch).catch((error) => {
      issues.push(error instanceof Error ? error.message : String(error));
      return undefined;
    }),
  ]);

  let workflowRuns = workflowRunsByBranch;
  if (!Array.isArray(workflowRunsByBranch?.workflow_runs) || workflowRunsByBranch.workflow_runs.length === 0) {
    workflowRuns = await fetchJson<WorkflowRunsPayload>(
      `${GITHUB_API}/repos/${repo.owner}/${repo.name}/actions/runs?per_page=100`,
    );
    if (!Array.isArray(workflowRuns?.workflow_runs) || workflowRuns.workflow_runs.length === 0) {
      issues.push('workflow runs payload is unavailable');
    }
  }

  const restFallback = !graphqlData?.repository || !graphqlData.repository.metricsBranchRef
    ? await fetchRestFallback(repo, since7d.toISOString(), branchSources.metricsBranch).catch((error) => {
        issues.push(error instanceof Error ? error.message : String(error));
        return undefined;
      })
    : undefined;

  const repository = graphqlData?.repository ?? null;
  if (!repository) {
    issues.push('repository payload is unavailable');
  }

  const mergedNodes = repository?.mergedPullRequests?.nodes ?? [];
  const window24h = createWindowRange(now, '24h');
  const window7d = createWindowRange(now, '7d');

  const commitCounts = {
    commits24h: repository?.metricsBranchRef?.target?.commits24h?.totalCount ?? 0,
    commits48h: repository?.metricsBranchRef?.target?.commits48h?.totalCount ?? 0,
    commits7d: repository?.metricsBranchRef?.target?.commits7d?.totalCount ?? restFallback?.commits7d ?? 0,
    commits14d: repository?.metricsBranchRef?.target?.commits14d?.totalCount ?? 0,
  };

  const normalizedRuns = normalizeWorkflowRuns(workflowRuns?.workflow_runs);
  const latestRun = normalizedRuns[0];
  const latestSuccessRun = normalizedRuns.find(
    (run) => run.conclusion === 'success' && typeof run.durationSeconds === 'number',
  );

  const workflow24h = computeWorkflowWindowStats(normalizedRuns, window24h);
  const workflow7d = computeWorkflowWindowStats(normalizedRuns, window7d);
  const merged24h = computeMergedPrWindowStats(mergedNodes, window24h);
  const merged7d = computeMergedPrWindowStats(mergedNodes, window7d);

  const tokensFreshnessMaxHours = Math.max(
    1,
    Number.parseFloat(process.env.TOKENS_STALE_HOURS || '24') || 24,
  );
  const tokenBudget24h = Math.max(0, Number.parseInt(process.env.TOKEN_BUDGET_24H || '0', 10) || 0);
  const tokenBudget7d = Math.max(0, Number.parseInt(process.env.TOKEN_BUDGET_7D || '0', 10) || 0);
  const tokensBudget24h = Math.max(0, Math.round(tokens.tokenBudget24h || 0));
  const tokensBudget7d = Math.max(0, Math.round(tokens.tokenBudget7d || 0));
  const resolvedTokenBudget24h =
    tokensBudget24h > 0 ? tokensBudget24h : tokenBudget24h;
  const resolvedTokenBudget7d =
    tokensBudget7d > 0 ? tokensBudget7d : tokenBudget7d;
  const workflowTargetDurationSeconds = Math.max(
    60,
    Number.parseInt(process.env.WORKFLOW_TARGET_DURATION_SECONDS || '1800', 10) || 1800,
  );
  const prLeadTimeTargetHours = Math.max(
    1,
    Number.parseInt(process.env.PR_LEAD_TIME_TARGET_HOURS || '24', 10) || 24,
  );

  const tokensUpdatedAtMs = new Date(tokens.updatedAt).getTime();
  const tokensAgeHours = Number.isFinite(tokensUpdatedAtMs)
    ? Math.max(0, (now.getTime() - tokensUpdatedAtMs) / (1000 * 60 * 60))
    : Number.POSITIVE_INFINITY;
  const tokensSchemaValid = !['unavailable', 'invalid', 'invalid-json'].includes(tokens.source);
  const tokensFresh = Number.isFinite(tokensAgeHours) && tokensAgeHours <= tokensFreshnessMaxHours;

  const commits24h = commitCounts.commits24h;
  const commitsPrev24h = Math.max(0, commitCounts.commits48h - commitCounts.commits24h);
  const commits7d = commitCounts.commits7d;
  const commitsPrev7d = Math.max(0, commitCounts.commits14d - commitCounts.commits7d);

  const mergedPullRequests7d = merged7d.mergedPrs;

  return {
    generatedAt: now.toISOString(),
    refreshIntervalSeconds: CLIENT_REFRESH_INTERVAL_SECONDS,
    repository: {
      owner: repo.owner,
      name: repo.name,
      fullName: repository?.nameWithOwner || restFallback?.repository.full_name || `${repo.owner}/${repo.name}`,
      url: repository?.url || restFallback?.repository.html_url || regressionRepo.webBase,
    },
    tokens,
    stars: repository?.stargazerCount || restFallback?.repository.stargazers_count || 0,
    forks: repository?.forkCount || restFallback?.repository.forks_count || 0,
    watchers: repository?.watchers?.totalCount || restFallback?.repository.subscribers_count || 0,
    openIssues: repository?.issues?.totalCount || restFallback?.openIssues || 0,
    openPullRequests: repository?.pullRequests?.totalCount || restFallback?.openPrs || 0,
    mergedPullRequests7d,
    commits7d,
    branch: {
      name: repository?.metricsBranchRef?.name || restFallback?.branchName || branchSources.metricsBranch,
      commitSha: repository?.metricsBranchRef?.target?.oid || restFallback?.branchCommit?.sha || '',
      committedAt:
        repository?.metricsBranchRef?.target?.committedDate ||
        restFallback?.branchCommit?.commit?.committer?.date ||
        now.toISOString(),
      status: statusFromRollup(repository?.metricsBranchRef?.target?.statusCheckRollup?.state),
      commitUrl: repository?.metricsBranchRef?.target?.url || restFallback?.branchCommit?.html_url,
    },
    ci: {
      workflow: workflowRuns?.workflow_runs?.[0]?.name || workflowRuns?.workflow_runs?.[0]?.display_title || 'unknown',
      conclusion: latestRun?.conclusion || 'unknown',
      createdAt: latestRun?.createdAt || now.toISOString(),
      updatedAt: latestRun?.updatedAt || now.toISOString(),
      latestSuccessDurationSeconds: latestSuccessRun?.durationSeconds,
      url: latestRun?.url,
    },
    latestRelease,
    observatory: {
      githubReachable: Boolean(repository || restFallback),
      tokensSchemaValid,
      tokensFresh,
      tokensAgeHours: Number.isFinite(tokensAgeHours) ? Number(tokensAgeHours.toFixed(2)) : 0,
      windows: {
        '24h': {
          tokens: tokens.tokens24h,
          commits: commits24h,
          previousCommits: commitsPrev24h,
          mergedPrs: merged24h.mergedPrs,
          previousMergedPrs: merged24h.previousMergedPrs,
          workflowRuns: workflow24h.workflowRuns,
          workflowSuccessRate: workflow24h.workflowSuccessRate,
          previousWorkflowSuccessRate: workflow24h.previousWorkflowSuccessRate,
          medianWorkflowDurationSeconds: workflow24h.medianWorkflowDurationSeconds,
          previousMedianWorkflowDurationSeconds: workflow24h.previousMedianWorkflowDurationSeconds,
          brokenMainMinutes: workflow24h.brokenMainMinutes,
          brokenMainReason: workflow24h.brokenMainReason,
          medianPrLeadTimeHours: merged24h.medianPrLeadTimeHours,
          previousMedianPrLeadTimeHours: merged24h.previousMedianPrLeadTimeHours,
          latestConclusions: workflow24h.latestConclusions,
        },
        '7d': {
          tokens: tokens.tokens7d,
          commits: commits7d,
          previousCommits: commitsPrev7d,
          mergedPrs: merged7d.mergedPrs,
          previousMergedPrs: merged7d.previousMergedPrs,
          workflowRuns: workflow7d.workflowRuns,
          workflowSuccessRate: workflow7d.workflowSuccessRate,
          previousWorkflowSuccessRate: workflow7d.previousWorkflowSuccessRate,
          medianWorkflowDurationSeconds: workflow7d.medianWorkflowDurationSeconds,
          previousMedianWorkflowDurationSeconds: workflow7d.previousMedianWorkflowDurationSeconds,
          brokenMainMinutes: workflow7d.brokenMainMinutes,
          brokenMainReason: workflow7d.brokenMainReason,
          medianPrLeadTimeHours: merged7d.medianPrLeadTimeHours,
          previousMedianPrLeadTimeHours: merged7d.previousMedianPrLeadTimeHours,
          latestConclusions: workflow7d.latestConclusions,
        },
      },
      config: {
        tokensFreshnessMaxHours,
        tokenBudget24h: resolvedTokenBudget24h,
        tokenBudget7d: resolvedTokenBudget7d,
        workflowTargetDurationSeconds,
        prLeadTimeTargetHours,
      },
    },
    commitWeeklyTrend: buildCommitWeeklyTrend(Array.isArray(commitActivity) ? commitActivity : []),
    mergedPrDailyTrend: buildMergedPrDailyTrend(mergedNodes),
    issues,
  };
}

const cachedMetrics = unstable_cache(collectLiveMetricsSnapshot, ['live-metrics-v2'], {
  revalidate: GITHUB_REFRESH_INTERVAL_SECONDS,
});

function hasUsableGithubSignals(snapshot: LiveMetricsSnapshot) {
  if (!snapshot.observatory.githubReachable) {
    return false;
  }
  if (!snapshot.branch.commitSha) {
    return false;
  }
  return true;
}

function applyTokensToSnapshot(snapshot: LiveMetricsSnapshot, tokens: TokensAggregate): LiveMetricsSnapshot {
  const now = Date.now();
  const tokensUpdatedAtMs = new Date(tokens.updatedAt).getTime();
  const tokensAgeHours = Number.isFinite(tokensUpdatedAtMs)
    ? Math.max(0, (now - tokensUpdatedAtMs) / (1000 * 60 * 60))
    : Number.POSITIVE_INFINITY;
  const tokensSchemaValid = !['unavailable', 'invalid', 'invalid-json'].includes(tokens.source);
  const tokensFresh = Number.isFinite(tokensAgeHours)
    ? tokensAgeHours <= snapshot.observatory.config.tokensFreshnessMaxHours
    : false;
  const resolvedBudget24h =
    typeof tokens.tokenBudget24h === 'number' && tokens.tokenBudget24h > 0
      ? Math.round(tokens.tokenBudget24h)
      : snapshot.observatory.config.tokenBudget24h;
  const resolvedBudget7d =
    typeof tokens.tokenBudget7d === 'number' && tokens.tokenBudget7d > 0
      ? Math.round(tokens.tokenBudget7d)
      : snapshot.observatory.config.tokenBudget7d;

  return {
    ...snapshot,
    refreshIntervalSeconds: CLIENT_REFRESH_INTERVAL_SECONDS,
    tokens,
    observatory: {
      ...snapshot.observatory,
      tokensSchemaValid,
      tokensFresh,
      tokensAgeHours: Number.isFinite(tokensAgeHours) ? Number(tokensAgeHours.toFixed(2)) : snapshot.observatory.tokensAgeHours,
      windows: {
        '24h': {
          ...snapshot.observatory.windows['24h'],
          tokens: tokens.tokens24h,
        },
        '7d': {
          ...snapshot.observatory.windows['7d'],
          tokens: tokens.tokens7d,
        },
      },
      config: {
        ...snapshot.observatory.config,
        tokenBudget24h: resolvedBudget24h,
        tokenBudget7d: resolvedBudget7d,
      },
    },
  };
}

export async function getLiveMetricsSnapshot() {
  const snapshot = await cachedMetrics();
  const repo = resolveRepoConfig();
  const tokensRepo = resolveTokensConfig(repo);
  const liveTokens = await fetchTokensAggregate(tokensRepo).catch(() => undefined);
  const effectiveSnapshot = liveTokens ? applyTokensToSnapshot(snapshot, liveTokens) : snapshot;

  if (hasUsableGithubSignals(effectiveSnapshot)) {
    lastSuccessfulSnapshot = effectiveSnapshot;
    return effectiveSnapshot;
  }

  if (!lastSuccessfulSnapshot) {
    return effectiveSnapshot;
  }

  const mergedIssues = Array.from(
    new Set([
      ...effectiveSnapshot.issues,
      'GitHub telemetry temporarily unavailable. Serving last successful snapshot.',
    ]),
  );

  return {
    ...lastSuccessfulSnapshot,
    generatedAt: effectiveSnapshot.generatedAt,
    refreshIntervalSeconds: CLIENT_REFRESH_INTERVAL_SECONDS,
    tokens: effectiveSnapshot.tokens,
    observatory: {
      ...lastSuccessfulSnapshot.observatory,
      githubReachable: false,
      tokensSchemaValid: effectiveSnapshot.observatory.tokensSchemaValid,
      tokensFresh: effectiveSnapshot.observatory.tokensFresh,
      tokensAgeHours: effectiveSnapshot.observatory.tokensAgeHours,
      windows: {
        '24h': {
          ...lastSuccessfulSnapshot.observatory.windows['24h'],
          tokens: effectiveSnapshot.observatory.windows['24h'].tokens,
        },
        '7d': {
          ...lastSuccessfulSnapshot.observatory.windows['7d'],
          tokens: effectiveSnapshot.observatory.windows['7d'].tokens,
        },
      },
      config: effectiveSnapshot.observatory.config,
    },
    issues: mergedIssues,
  };
}
