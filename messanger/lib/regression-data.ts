import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseArtifactsSnapshot,
  parseMetricsSnapshot,
  parseMilestonesSnapshot,
  parseRunDetailSnapshot,
  parseRunsSnapshot,
} from '@/lib/regression-schema';
import type {
  ArtifactsSnapshot,
  MetricsSnapshot,
  MilestonesSnapshot,
  RunDetailSnapshot,
  RunsSnapshot,
} from '@/lib/regression-types';

const DATA_ROOT = path.join(process.cwd(), 'public', 'data');

async function readJson(relativePath: string): Promise<unknown | undefined> {
  try {
    const absolute = path.join(DATA_ROOT, relativePath);
    const content = await readFile(absolute, 'utf8');
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
}

function reportIssues(context: string, issues: string[]) {
  if (issues.length === 0) {
    return;
  }

  console.warn(`[regression-data] ${context}: ${issues.join('; ')}`);
}

export async function loadMetricsSnapshot(): Promise<MetricsSnapshot> {
  const primary = await readJson('metrics.json');
  const fallback = primary ?? (await readJson('dashboard.json'));
  const parsed = parseMetricsSnapshot(fallback);
  reportIssues('metrics', parsed.issues);
  return parsed.data;
}

export async function loadRunsSnapshot(): Promise<RunsSnapshot> {
  const source = await readJson('runs.json');
  const parsed = parseRunsSnapshot(source);
  reportIssues('runs', parsed.issues);
  return parsed.data;
}

export async function loadRunDetailSnapshot(id: string): Promise<RunDetailSnapshot | undefined> {
  const source = await readJson(`run/${id}.json`);
  const parsed = parseRunDetailSnapshot(source);
  reportIssues(`run/${id}`, parsed.issues);
  return parsed.data;
}

export async function loadArtifactsSnapshot(): Promise<ArtifactsSnapshot> {
  const source = await readJson('artifacts.json');
  const parsed = parseArtifactsSnapshot(source);
  reportIssues('artifacts', parsed.issues);
  return parsed.data;
}

export async function loadMilestonesSnapshot(): Promise<MilestonesSnapshot> {
  const source = await readJson('milestones.json');
  const parsed = parseMilestonesSnapshot(source);
  reportIssues('milestones', parsed.issues);
  return parsed.data;
}
