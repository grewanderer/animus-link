import { NextResponse } from 'next/server';

import { getLiveMetricsSnapshot } from '@/lib/github-metrics';

export const revalidate = 15;

export async function GET() {
  try {
    const metrics = await getLiveMetricsSnapshot();
    return NextResponse.json(metrics, {
      headers: {
        'Cache-Control': 's-maxage=15, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json(
      { error: message },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
