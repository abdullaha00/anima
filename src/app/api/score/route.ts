/**
 * POST /api/score
 *
 * A stub for the model stage. Until a model exists and has been validated,
 * the rules engine is the only engine and this route says so with a 501.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const NOT_AVAILABLE = {
  error:
    'Model scoring is not available. The rules engine is in use. POST the request shape in docs/DOMAIN.md when the model is ready.',
  validated: false,
};

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(NOT_AVAILABLE, { status: 501 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed. POST a scoring request.' }, { status: 405, headers: { Allow: 'POST' } });
}
