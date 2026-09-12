/**
 * GET /api/patients
 *
 * The population as the source sees it, kept light: id, name, age and
 * conditions per patient, plus the snapshot meta and the source mode.
 */

import { NextResponse } from 'next/server';
import { getPatients } from '@/lib/data/source';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const source = await getPatients();
  return NextResponse.json({
    mode: source.mode,
    degraded: source.degraded,
    degradedReason: source.degradedReason,
    meta: source.meta,
    count: source.patients.length,
    patients: source.patients.map((patient) => ({
      id: patient.id,
      name: patient.name,
      age: patient.age,
      conditions: patient.conditions,
    })),
  });
}
