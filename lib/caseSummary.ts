import parseCSV from './parseCSV';
import { getObjectBuffer, listAllCaseObjects, listObjectsForCase, CaseObjectSummary } from './s3';
import type { CaseSummary, CaseStatus } from '../types/case';
import {
  CASE_METADATA_FILENAME,
  prettifyCaseId,
  hashCaseId,
  readCaseMetadataFromKey,
  setCreatedAtIfEarlier,
} from './caseMetadata';

type CaseFileGroup = {
  id: string;
  pgmKey?: string;
  yamlKey?: string;
  csvKey?: string;
  metadataKey?: string;
  createdAt?: string;
  updatedAt?: string;
  files: string[];
};

type EvidenceStats = {
  count: number;
  earliestTime?: string;
  latestTime?: string;
};

export async function getCaseSummaries(): Promise<CaseSummary[]> {
  const grouped = buildGroups(await listAllCaseObjects());
  const summaries = await Promise.all(grouped.map(buildSummary));
  return summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getCaseSummary(caseId: string, prefetched?: CaseObjectSummary[]): Promise<CaseSummary | null> {
  const objects = prefetched ?? await listObjectsForCase(caseId);
  if (!objects.length) return null;
  const group = buildGroupFromObjects(caseId, objects);
  if (!group) return null;
  return buildSummary(group);
}

function buildGroups(objects: CaseObjectSummary[]): CaseFileGroup[] {
  const map = new Map<string, CaseFileGroup>();
  for (const obj of objects) {
    const relative = obj.relativeKey.replace(/^\/+/, '');
    if (!relative) continue;
    const [maybeId, ...rest] = relative.split('/');
    if (!maybeId) continue;
    const filePath = rest.join('/') || '';
    if (!filePath) continue;
    const entry = map.get(maybeId) ?? { id: maybeId, files: [] };
    map.set(maybeId, enrichGroup(entry, obj.key, filePath, obj.lastModified));
  }
  return Array.from(map.values());
}

function buildGroupFromObjects(caseId: string, objects: CaseObjectSummary[]): CaseFileGroup | null {
  if (!objects.length) return null;
  let group: CaseFileGroup | null = null;
  for (const obj of objects) {
    const relative = obj.relativeKey.replace(/^\/+/, '');
    if (!relative.startsWith(`${caseId}/`)) continue;
    const filePath = relative.slice(caseId.length + 1);
    if (!filePath) continue;
    group = enrichGroup(group ?? { id: caseId, files: [] }, obj.key, filePath, obj.lastModified);
  }
  return group;
}

function enrichGroup(group: CaseFileGroup, absoluteKey: string, filePath: string, lastModified?: Date): CaseFileGroup {
  const lower = filePath.toLowerCase();
  const filename = lower.split('/').pop();
  if (lower.endsWith('.pgm')) group.pgmKey = absoluteKey;
  else if (lower.endsWith('.yaml') || lower.endsWith('.yml')) group.yamlKey = absoluteKey;
  else if (lower.endsWith('.csv')) group.csvKey = absoluteKey;
  else if (filename === CASE_METADATA_FILENAME) group.metadataKey = absoluteKey;
  group.files = Array.from(new Set([...group.files, filePath]));
  const timestamp = lastModified ? lastModified.toISOString() : undefined;
  if (timestamp) {
    if (!group.updatedAt || new Date(timestamp).getTime() > new Date(group.updatedAt).getTime()) {
      group.updatedAt = timestamp;
    }
    if (!group.createdAt || new Date(timestamp).getTime() < new Date(group.createdAt).getTime()) {
      group.createdAt = timestamp;
    }
  }
  return group;
}

async function buildSummary(group: CaseFileGroup): Promise<CaseSummary> {
  const evidenceStats = await readEvidenceStats(group.csvKey);
  const evidenceCount = evidenceStats.count;
  const fallbackTitle = prettifyCaseId(group.id);
  const fallbackUpdatedAt = group.updatedAt ?? new Date().toISOString();
  const fallbackCreatedAt = group.createdAt ?? fallbackUpdatedAt;
  const hash = hashCaseId(group.id);
  const metadata = group.metadataKey ? await readCaseMetadataFromKey(group.metadataKey, group.id) : null;
  const title = metadata?.title ?? fallbackTitle;
  const derivedUpdatedAt = evidenceStats.latestTime ? mergeDateAndTime(fallbackUpdatedAt, evidenceStats.latestTime) : null;
  const updatedAt = metadata?.updatedAt ?? derivedUpdatedAt ?? fallbackUpdatedAt;
  const derivedCreatedAt = evidenceStats.earliestTime ? mergeDateAndTime(fallbackCreatedAt, evidenceStats.earliestTime) : null;
  const createdAt = derivedCreatedAt ?? metadata?.createdAt ?? fallbackCreatedAt;
  if (derivedCreatedAt) {
    await setCreatedAtIfEarlier(group.id, derivedCreatedAt);
  }
  const description = normalizeField(metadata?.description);
  const status = metadata?.status ?? deriveStatus(evidenceCount, updatedAt, hash);
  const createdBy = normalizeField(metadata?.createdBy);
  const tags = Array.isArray(metadata?.tags) && metadata.tags.length ? metadata.tags : [];
  return {
    id: group.id,
    title,
    description,
    status,
    createdBy,
    updatedAt,
    createdAt,
    evidenceCount,
    tags,
    files: {
      pgm: group.pgmKey ? basename(group.pgmKey) : undefined,
      yaml: group.yamlKey ? basename(group.yamlKey) : undefined,
      csv: group.csvKey ? basename(group.csvKey) : undefined,
    }
  };
}

async function readEvidenceStats(key?: string): Promise<EvidenceStats> {
  if (!key) return { count: 0 };
  try {
    const buf = await getObjectBuffer(key);
    const data = parseCSV(buf.toString('utf-8'));
    if (!Array.isArray(data)) return { count: 0 };
    let earliest: { seconds: number; value: string } | null = null;
    let latest: { seconds: number; value: string } | null = null;
    for (const row of data as Array<Record<string, any>>) {
      const parsed = parseTime(row?.time);
      if (!parsed) continue;
      if (!earliest || parsed.seconds < earliest.seconds) {
        earliest = parsed;
      }
      if (!latest || parsed.seconds > latest.seconds) {
        latest = parsed;
      }
    }
    return {
      count: data.length,
      earliestTime: earliest?.value,
      latestTime: latest?.value,
    };
  } catch (err) {
    console.warn('Failed to read evidence CSV', err);
    return { count: 0 };
  }
}

function normalizeField(value?: string | null) {
  if (typeof value === 'string' && value.trim().length) {
    return value.trim();
  }
  return '-';
}

function parseTime(raw: unknown): { seconds: number; value: string } | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
    const match = trimmed.match(/^([0-1]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return null;
  const [, hh, mm, ss] = match;
  const hours = Number(hh);
  const minutes = Number(mm);
  const seconds = Number(ss ?? '0');
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const normalized = `${hh.padStart(2, '0')}:${mm}:${(ss ?? '00').padStart(2, '0')}`;
  return { seconds: totalSeconds, value: normalized };
}

function mergeDateAndTime(dateIso: string, time: string): string | null {
  if (!dateIso) return null;
  const base = new Date(dateIso);
  if (Number.isNaN(base.getTime())) return null;
  const parsed = parseTime(time);
  if (!parsed) return null;
  const hours = Math.floor(parsed.seconds / 3600);
  const minutes = Math.floor((parsed.seconds % 3600) / 60);
  const seconds = parsed.seconds % 60;
  base.setUTCHours(hours, minutes, seconds, 0);
  return base.toISOString();
}

function deriveStatus(evidenceCount: number, updatedAt: string, seed: number): CaseStatus {
  const ageDays = Math.max(0, (Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  if (evidenceCount === 0) return 'open';
  if (ageDays < 2) return 'in-progress';
  if (evidenceCount > 8) return 'closed';
  return ['in-progress', 'archived'][seed % 2] as CaseStatus;
}

function basename(key: string) {
  const parts = key.split('/');
  return parts[parts.length - 1] || key;
}
