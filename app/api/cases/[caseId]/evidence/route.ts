import { NextResponse } from 'next/server';
import { putObjectBuffer, listObjectsForCase, getObjectBuffer } from '@lib/s3';
import parsePGM from '@lib/parsePGM';
import parseYAML from '@lib/parseYAML';
import { pixelToWorld, convertEvidenceToPixels } from '@lib/mapUtils';

type EvidencePayload = {
  id?: string;
  x?: string | number;
  y?: string | number;
  time?: string;
  pixel?: { x: number; y: number };
};

type Body = { evidence: any[]; filename?: string };

const CSV_HEADERS = ['id', 'x', 'y', 'time'] as const;

function escapeCsv(value: string) {
  if (value === undefined || value === null) return '';
  if (/[",\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function rowsToCSV(rows: Record<string, string>[]): Buffer {
  const headerLine = CSV_HEADERS.join(',');
  const bodyLines = rows.map(row => CSV_HEADERS.map(key => escapeCsv(row[key] ?? '')).join(','));
  return Buffer.from([headerLine, ...bodyLines].join('\n'));
}

function normalizeTime(value?: string) {
  if (value) {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
      const [, hh, mm, ss] = match;
      return `${hh.padStart(2, '0')}:${mm}:${(ss ?? '00').padStart(2, '0')}`;
    }
  }
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function formatNumber(value?: string | number) {
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(num)) {
    return num.toFixed(6);
  }
  return '';
}

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await context.params;
    const body = (await request.json()) as Body;
    if (!body || !Array.isArray(body.evidence)) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

    const keys = await listObjectsForCase(caseId);
    const findKey = (ext: string, predicate?: (k: string) => boolean) =>
      keys.find(k => k.toLowerCase().endsWith(ext) && (!predicate || predicate(k)));

    const pgmKey = findKey('.pgm');
    const yamlKey = keys.find(k => k.toLowerCase().endsWith('.yaml') || k.toLowerCase().endsWith('.yml'));

    if (!pgmKey || !yamlKey) {
      return NextResponse.json({ error: 'Missing PGM or YAML for case' }, { status: 400 });
    }

    const evidenceKeyFromBucket = keys.find(k => k.toLowerCase().includes('evidence') && k.toLowerCase().endsWith('.csv'));
    const filename = body.filename || (evidenceKeyFromBucket ? evidenceKeyFromBucket.split('/').pop() : `${caseId}_evidence.csv`);
    const targetKey = `${(process.env.S3_PREFIX || '')}${caseId}/${filename}`;

    const [pgmBuf, yamlBuf] = await Promise.all([
      getObjectBuffer(pgmKey),
      getObjectBuffer(yamlKey)
    ]);

    const pgm = parsePGM(pgmBuf);
    const yaml = parseYAML(yamlBuf.toString('utf-8'));

    const csvRows = buildCsvRows(body.evidence as EvidencePayload[], yaml.origin, yaml.resolution, pgm.height);
    const buf = rowsToCSV(csvRows);
    await putObjectBuffer(targetKey, buf, 'text/csv');

    const evidenceObjects = csvRows.map(row => ({
      id: row.id,
      x: row.x,
      y: row.y,
      time: row.time
    }));
    const evidenceWithPixels = convertEvidenceToPixels(evidenceObjects, yaml.origin, yaml.resolution, pgm.height);

    return NextResponse.json({ success: true, key: targetKey, evidence: evidenceWithPixels });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

function buildCsvRows(
  evidence: EvidencePayload[],
  origin: [number, number, number],
  resolution: number,
  height: number
) {
  let maxNumericId = 0;
  const usedIds = new Set<number>();

  for (const item of evidence) {
    const numeric = Number(item.id);
    if (!Number.isNaN(numeric)) {
      maxNumericId = Math.max(maxNumericId, numeric);
    }
  }

  return evidence.map((item) => {
    let numericId = Number(item.id);
    if (Number.isNaN(numericId) || usedIds.has(numericId)) {
      numericId = ++maxNumericId;
    }
    usedIds.add(numericId);

    let worldX: number | undefined;
    let worldY: number | undefined;

    if (item.pixel) {
      const world = pixelToWorld(item.pixel.x, item.pixel.y, origin, resolution, height);
      worldX = world.x;
      worldY = world.y;
    }

    if (!Number.isFinite(worldX as number) || !Number.isFinite(worldY as number)) {
      const parsedX = Number(item.x);
      const parsedY = Number(item.y);
      if (Number.isFinite(parsedX)) worldX = parsedX;
      if (Number.isFinite(parsedY)) worldY = parsedY;
    }

    if (worldX === undefined || worldY === undefined) {
      worldX = 0;
      worldY = 0;
    }

    const time = normalizeTime(item.time);

    return {
      id: String(numericId),
      x: formatNumber(worldX),
      y: formatNumber(worldY),
      time,
    };
  });
}
