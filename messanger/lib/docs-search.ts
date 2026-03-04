export type DocsSearchEntry = {
  docId: string;
  slug: string;
  title: string;
  section: string;
  heading: string;
  headingId?: string | null;
  content: string;
  keywords?: string[];
  url: string;
};

export type DocsSearchIndex = {
  version: string;
  locale: string;
  generatedAt: string;
  entries: DocsSearchEntry[];
};

type PreparedEntry = DocsSearchEntry & {
  _title: string;
  _section: string;
  _heading: string;
  _content: string;
  _keywords: string;
};

export type PreparedSearchIndex = DocsSearchIndex & {
  entries: PreparedEntry[];
};

export type DocsSearchResult = {
  slug: string;
  title: string;
  section: string;
  heading: string;
  headingId?: string | null;
  url: string;
  score: number;
  snippet: string;
};

const FIELD_WEIGHTS = {
  title: 8,
  heading: 5,
  section: 4,
  keywords: 3,
  content: 1,
};

const MAX_SNIPPET_LENGTH = 140;

export function prepareSearchIndex(index: DocsSearchIndex): PreparedSearchIndex {
  return {
    ...index,
    entries: index.entries.map((entry) => {
      const keywords = entry.keywords?.join(' ') ?? '';
      return {
        ...entry,
        _title: entry.title.toLowerCase(),
        _section: entry.section.toLowerCase(),
        _heading: entry.heading.toLowerCase(),
        _content: entry.content.toLowerCase(),
        _keywords: keywords.toLowerCase(),
      };
    }),
  };
}

export function searchDocs(index: PreparedSearchIndex | null, query: string): DocsSearchResult[] {
  if (!index) return [];
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const tokens = tokenize(normalized);
  if (!tokens.length) return [];

  const bestBySlug = new Map<string, { entry: PreparedEntry; score: number }>();

  for (const entry of index.entries) {
    const score = scoreEntry(entry, tokens);
    if (score <= 0) continue;
    const existing = bestBySlug.get(entry.slug);
    if (!existing || score > existing.score) {
      bestBySlug.set(entry.slug, { entry, score });
    }
  }

  const results: DocsSearchResult[] = [];
  for (const { entry, score } of bestBySlug.values()) {
    const snippet = buildSnippet(entry.content, tokens);
    results.push({
      slug: entry.slug,
      title: entry.title,
      section: entry.section,
      heading: entry.heading,
      headingId: entry.headingId,
      url: entry.url,
      score,
      snippet,
    });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title);
  });

  return results.slice(0, 10);
}

function tokenize(value: string): string[] {
  return value
    .split(/[\s/]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreEntry(entry: PreparedEntry, tokens: string[]): number {
  let score = 0;
  for (const token of tokens) {
    score += scoreField(entry._title, token, FIELD_WEIGHTS.title);
    score += scoreField(entry._section, token, FIELD_WEIGHTS.section);
    score += scoreField(entry._heading, token, FIELD_WEIGHTS.heading);
    score += scoreField(entry._keywords, token, FIELD_WEIGHTS.keywords);
    score += scoreField(entry._content, token, FIELD_WEIGHTS.content);
  }
  return score;
}

function scoreField(field: string, token: string, weight: number): number {
  if (!field || !token) return 0;
  const index = field.indexOf(token);
  if (index === -1) return 0;
  let score = weight;

  const isStart = index === 0;
  const prevChar = index > 0 ? field[index - 1] : '';
  const isWordStart = isStart || /[^a-z0-9]/i.test(prevChar);
  if (isWordStart) score += weight * 0.6;

  const positionBonus = Math.max(0, 1 - index / Math.max(field.length, 1));
  score += weight * 0.4 * positionBonus;

  return score;
}

function buildSnippet(content: string, tokens: string[]): string {
  if (!content) return '';
  const lower = content.toLowerCase();
  let matchIndex = -1;
  for (const token of tokens) {
    const idx = lower.indexOf(token);
    if (idx !== -1) {
      matchIndex = idx;
      break;
    }
  }
  if (matchIndex === -1) {
    return truncate(content, MAX_SNIPPET_LENGTH);
  }

  const half = Math.floor(MAX_SNIPPET_LENGTH / 2);
  const start = Math.max(0, matchIndex - half);
  const end = Math.min(content.length, matchIndex + half);
  const snippet = content.slice(start, end).trim();
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  return `${prefix}${snippet}${suffix}`;
}

function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length).trim()}…`;
}
