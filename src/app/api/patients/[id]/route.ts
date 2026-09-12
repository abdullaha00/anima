/**
 * GET /api/patients/[id]
 *
 * The full normalised Patient, or a 404 JSON body when the id is not in the slice.
 */

import { NextResponse } from 'next/server';
import { getPatient } from '@/lib/data/source';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const patient = await getPatient(id);
  if (!patient) {
    return NextResponse.json({ error: `No patient with id ${id} in the current slice.` }, { status: 404 });
  }
  return NextResponse.json(patient);
}
