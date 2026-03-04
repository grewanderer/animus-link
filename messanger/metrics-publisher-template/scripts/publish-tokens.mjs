#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

function asNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

async function readHttpSource() {
  const endpoint = process.env.TOKENS_SOURCE_ENDPOINT?.trim();
  if (!endpoint) {
    throw new Error('TOKENS_SOURCE_ENDPOINT is required when TOKENS_SOURCE_MODE=http-json');
  }

  const token = process.env.TOKENS_SOURCE_TOKEN?.trim();
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP source failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object') {
    throw new Error('HTTP source payload is not an object');
  }

  return {
    tokens_total: asNonNegativeNumber(payload.tokens_total),
    tokens_24h: asNonNegativeNumber(payload.tokens_24h),
    tokens_7d: asNonNegativeNumber(payload.tokens_7d),
  };
}

function readManualSource() {
  return {
    tokens_total: asNonNegativeNumber(process.env.TOKENS_TOTAL),
    tokens_24h: asNonNegativeNumber(process.env.TOKENS_24H),
    tokens_7d: asNonNegativeNumber(process.env.TOKENS_7D),
  };
}

async function resolveAggregate() {
  const mode = (process.env.TOKENS_SOURCE_MODE || 'manual').trim().toLowerCase();
  const sourceLabel = process.env.TOKENS_SOURCE_LABEL?.trim() || mode;

  if (mode === 'http-json') {
    const payload = await readHttpSource();
    return { ...payload, source: sourceLabel };
  }

  const payload = readManualSource();
  return { ...payload, source: sourceLabel || 'manual' };
}

async function writeTokensJson(data) {
  const outputPath = path.join(process.cwd(), 'public', 'data', 'tokens.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(`${outputPath}`, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main() {
  const resolved = await resolveAggregate();
  const output = {
    updated_at: new Date().toISOString(),
    tokens_total: resolved.tokens_total,
    tokens_24h: resolved.tokens_24h,
    tokens_7d: resolved.tokens_7d,
    source: resolved.source,
  };

  await writeTokensJson(output);
  console.log('[tokens] published aggregate snapshot');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[tokens] publish failed: ${message}`);
  process.exitCode = 1;
});
