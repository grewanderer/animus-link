import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DISABLED_MESSAGE = 'Lead endpoint is disabled in Link web messenger mode.';

export async function POST() {
  return NextResponse.json({ ok: false, error: DISABLED_MESSAGE }, { status: 410 });
}
