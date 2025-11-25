import { NextResponse } from 'next/server';
import { putObjectBuffer, listObjectsForCase } from '../../../../../../lib/s3';

type Body = { evidence: any[]; filename?: string };

function toCSV(rows: any[]): Buffer {
  if (!rows || rows.length === 0) return Buffer.from('');
  const keys = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const header = keys.join(',');
  const lines = rows.map(r => keys.map(k => escape(r[k])).join(','));
  return Buffer.from([header, ...lines].join('\n'));
}

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await context.params;
    const body = (await request.json()) as Body;
    if (!body || !Array.isArray(body.evidence)) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

    // choose filename: use provided filename or try to find existing evidence filename
    let filename = body.filename;
    if (!filename) {
      const keys = await listObjectsForCase(caseId);
      const found = keys.find(k => k.toLowerCase().includes('evidence') && k.toLowerCase().endsWith('.csv'));
      filename = found ? found.split('/').pop() : `${caseId}_evidence.csv`;
    }

    const key = `${(process.env.S3_PREFIX || '')}${caseId}/${filename}`;
    const buf = toCSV(body.evidence);
    await putObjectBuffer(key, buf, 'text/csv');
    return NextResponse.json({ success: true, key });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
