'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { regressionRepo } from '@/lib/regression-repo';
import type { RunRecord } from '@/lib/regression-types';
import { localizeSitePath, toIntlLocale, type SiteLocale } from '@/lib/site-locale';
import { createSiteTranslator } from '@/lib/site-translations';
import { cn } from '@/lib/utils';

type Props = {
  runs: RunRecord[];
  locale: SiteLocale;
};

const ALL_VALUE = '__all__';

function formatTokens(locale: SiteLocale, value?: number) {
  return typeof value === 'number' ? value.toLocaleString(toIntlLocale(locale)) : '—';
}

function formatTimestamp(locale: SiteLocale, value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(toIntlLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortSha(sha: string) {
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}

function statusTone(status: RunRecord['status']) {
  switch (status) {
    case 'succeeded':
      return 'border-emerald-300/50 bg-emerald-400/15 text-emerald-100';
    case 'failed':
      return 'border-rose-300/50 bg-rose-400/15 text-rose-100';
    case 'running':
      return 'border-sky-300/50 bg-sky-400/15 text-sky-100';
    case 'queued':
      return 'border-amber-300/50 bg-amber-300/15 text-amber-100';
    default:
      return 'border-white/20 bg-white/10 text-white/80';
  }
}

function replayTone(status: RunRecord['replayStatus']) {
  switch (status) {
    case 'replayed':
      return 'border-emerald-300/50 bg-emerald-400/15 text-emerald-100';
    case 'failed_replay':
      return 'border-rose-300/50 bg-rose-400/15 text-rose-100';
    case 'pending':
      return 'border-amber-300/50 bg-amber-300/15 text-amber-100';
    default:
      return 'border-white/20 bg-white/10 text-white/80';
  }
}

export function RunsTable({ runs, locale }: Props) {
  const t = createSiteTranslator(locale);
  const [model, setModel] = useState(ALL_VALUE);
  const [branch, setBranch] = useState(ALL_VALUE);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reproducibleOnly, setReproducibleOnly] = useState(false);
  const [replayedOnly, setReplayedOnly] = useState(false);
  const [failedOnly, setFailedOnly] = useState(false);

  const modelOptions = useMemo(() => {
    return [
      { label: t('runsTable.allOption'), value: ALL_VALUE },
      ...Array.from(new Set(runs.map((run) => run.model)))
        .sort()
        .map((value) => ({ label: value, value })),
    ];
  }, [runs, t]);

  const branchOptions = useMemo(() => {
    return [
      { label: t('runsTable.allOption'), value: ALL_VALUE },
      ...Array.from(new Set(runs.map((run) => run.branch)))
        .sort()
        .map((value) => ({ label: value, value })),
    ];
  }, [runs, t]);

  const filtered = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00Z`).getTime() : undefined;
    const to = toDate ? new Date(`${toDate}T23:59:59Z`).getTime() : undefined;

    return runs.filter((run) => {
      const runTime = new Date(run.timestamp).getTime();
      if (Number.isNaN(runTime)) {
        return false;
      }
      if (model !== ALL_VALUE && run.model !== model) {
        return false;
      }
      if (branch !== ALL_VALUE && run.branch !== branch) {
        return false;
      }
      if (typeof from === 'number' && runTime < from) {
        return false;
      }
      if (typeof to === 'number' && runTime > to) {
        return false;
      }
      if (reproducibleOnly && !run.reproducible) {
        return false;
      }
      if (replayedOnly && run.replayStatus !== 'replayed') {
        return false;
      }
      if (failedOnly && run.status !== 'failed') {
        return false;
      }
      return true;
    });
  }, [branch, failedOnly, fromDate, model, replayedOnly, reproducibleOnly, runs, toDate]);

  return (
    <div className="space-y-4">
      <fieldset className="grid gap-3 rounded-2xl border border-white/12 bg-[#0b1626]/75 p-4 lg:grid-cols-3">
        <legend className="sr-only">{t('runsTable.legend')}</legend>

        <label className="flex min-w-[160px] flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/60">
          {t('runsTable.model')}
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="rounded-xl border border-white/20 bg-[#07101d] px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
            aria-label={t('runsTable.modelAria')}
          >
            {modelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[160px] flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/60">
          {t('runsTable.branch')}
          <select
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            className="rounded-xl border border-white/20 bg-[#07101d] px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
            aria-label={t('runsTable.branchAria')}
          >
            {branchOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/60">
            {t('runsTable.from')}
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="rounded-xl border border-white/20 bg-[#07101d] px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
              aria-label={t('runsTable.fromAria')}
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/60">
            {t('runsTable.to')}
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="rounded-xl border border-white/20 bg-[#07101d] px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
              aria-label={t('runsTable.toAria')}
            />
          </label>
        </div>

        <div className="col-span-full flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/80">
            <input
              type="checkbox"
              checked={reproducibleOnly}
              onChange={(event) => setReproducibleOnly(event.target.checked)}
              className="h-4 w-4"
            />
            {t('runsTable.reproducibleOnly')}
          </label>
          <label className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/80">
            <input
              type="checkbox"
              checked={replayedOnly}
              onChange={(event) => setReplayedOnly(event.target.checked)}
              className="h-4 w-4"
            />
            {t('runsTable.replayedOnly')}
          </label>
          <label className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/80">
            <input
              type="checkbox"
              checked={failedOnly}
              onChange={(event) => setFailedOnly(event.target.checked)}
              className="h-4 w-4"
            />
            {t('runsTable.failedOnly')}
          </label>
        </div>
      </fieldset>

      <div className="overflow-x-auto rounded-2xl border border-white/12 bg-[#0b1626]/75">
        <table className="min-w-full text-left text-sm text-white/80" aria-label={t('runsTable.tableAria')}>
          <thead className="sticky top-0 z-10 border-b border-white/12 bg-white/[0.05] text-xs uppercase tracking-[0.2em] text-white/60 backdrop-blur-sm">
            <tr>
              <th className="px-4 py-3">{t('runsTable.header.runId')}</th>
              <th className="px-4 py-3">{t('runsTable.header.timestamp')}</th>
              <th className="px-4 py-3">{t('runsTable.header.model')}</th>
              <th className="px-4 py-3">{t('runsTable.header.branch')}</th>
              <th className="px-4 py-3">{t('runsTable.header.commit')}</th>
              <th className="px-4 py-3">{t('runsTable.header.tokens')}</th>
              <th className="px-4 py-3">{t('runsTable.header.status')}</th>
              <th className="px-4 py-3">{t('runsTable.header.replay')}</th>
              <th className="px-4 py-3">{t('runsTable.header.proofHash')}</th>
              <th className="px-4 py-3">{t('runsTable.header.detail')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-white/60">
                  {t('runsTable.noRows')}
                </td>
              </tr>
            ) : (
              filtered.map((run) => (
                <tr key={run.id} className="border-t border-white/8 align-top transition hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-mono text-xs text-white">
                    <Link
                      href={localizeSitePath(locale, `/runs/${run.id}`)}
                      className="underline decoration-white/30 underline-offset-4"
                    >
                      {run.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-white/70">{formatTimestamp(locale, run.timestamp)}</td>
                  <td className="px-4 py-3 text-xs">{run.model}</td>
                  <td className="px-4 py-3 font-mono text-xs">{run.branch}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {run.commitSha !== 'unknown-sha' ? (
                      <a
                        href={regressionRepo.commitWeb(run.commitSha)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-white/30 underline-offset-4 hover:text-white"
                      >
                        {shortSha(run.commitSha)}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{formatTokens(locale, run.tokens)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.12em]',
                        statusTone(run.status),
                      )}
                    >
                      {t(`status.${run.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.12em]',
                        replayTone(run.replayStatus),
                      )}
                    >
                      {t(`replay.${run.replayStatus}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-white/75">
                    {run.proofHash ? (
                      run.proofBundleUrl ? (
                        <a
                          href={run.proofBundleUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-white/30 underline-offset-4"
                        >
                          {shortSha(run.proofHash)}
                        </a>
                      ) : (
                        shortSha(run.proofHash)
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <Link
                      href={localizeSitePath(locale, `/runs/${run.id}`)}
                      className="underline decoration-white/30 underline-offset-4"
                    >
                      {t('runsTable.detailLink')}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
