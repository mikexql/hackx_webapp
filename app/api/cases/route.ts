import { NextResponse } from 'next/server';
import { listCaseIds } from '../../../lib/s3';

export async function GET() {
  try {
    const ids = await listCaseIds();
    return NextResponse.json({ cases: ids });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
