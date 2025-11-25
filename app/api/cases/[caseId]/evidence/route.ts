import { NextResponse } from 'next/server';
import { putObjectBuffer, listObjectsForCase, getObjectBuffer, buildCaseObjectKey } from '@lib/s3';
import parsePGM from '@lib/parsePGM';
import parseYAML from '@lib/parseYAML';
import { pixelToWorld, convertEvidenceToPixels } from '@lib/mapUtils';
import { CASE_METADATA_FILENAME, CaseMetadataPatch, ensureMetadataFile, upsertCaseMetadata } from '@lib/caseMetadata';
import type { CaseMetadata } from '@/types/case';

type EvidencePayload = {
  id?: string;
  x?: string | number;
  y?: string | number;
  time?: string;
  pixel?: { x: number; y: number };
};

type Body = { evidence: any[]; filename?: string; metadata?: unknown };

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

    const objects = await listObjectsForCase(caseId);
    const findKey = (ext: string, predicate?: (k: string) => boolean) =>
      objects.find(o => o.key.toLowerCase().endsWith(ext) && (!predicate || predicate(o.key)))?.key;

    const pgmKey = findKey('.pgm');
    const yamlKey = objects.find(o => o.key.toLowerCase().endsWith('.yaml') || o.key.toLowerCase().endsWith('.yml'))?.key;

    if (!pgmKey || !yamlKey) {
      return NextResponse.json({ error: 'Missing PGM or YAML for case' }, { status: 400 });
    }

    const evidenceKeyFromBucket = objects.find(o => o.key.toLowerCase().includes('evidence') && o.key.toLowerCase().endsWith('.csv'))?.key;
    const hasMetadataFile = objects.some((o) => o.key.toLowerCase().endsWith(`/${CASE_METADATA_FILENAME}`) || o.key.toLowerCase().endsWith(CASE_METADATA_FILENAME));
    const derivedName = evidenceKeyFromBucket?.split('/').pop();
    const filename = (body.filename && body.filename.trim()) || derivedName || `${caseId}_evidence.csv`;
    const targetKey = buildCaseObjectKey(caseId, filename);
    const metadataPatch = extractMetadataPatch(body.metadata);

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

    let metadataResult: CaseMetadata | null = null;
    if (metadataPatch) {
      metadataResult = await upsertCaseMetadata(caseId, metadataPatch);
    } else if (!hasMetadataFile) {
      metadataResult = await ensureMetadataFile(caseId);
    }

    return NextResponse.json({ success: true, key: targetKey, evidence: evidenceWithPixels, metadata: metadataResult });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

function extractMetadataPatch(raw: unknown): CaseMetadataPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const patch: CaseMetadataPatch = {};
  const source = raw as Record<string, unknown>;
  if (typeof source.title === 'string') patch.title = source.title;
  if (typeof source.description === 'string') patch.description = source.description;
  if (typeof source.createdBy === 'string') patch.createdBy = source.createdBy;
  if (typeof source.status === 'string') patch.status = source.status as CaseMetadataPatch['status'];
  if (Array.isArray(source.tags)) {
    patch.tags = source.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean);
  }
  return Object.keys(patch).length ? patch : null;
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
