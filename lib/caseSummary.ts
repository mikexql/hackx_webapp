import parseCSV from './parseCSV';
import { getObjectBuffer, listAllCaseObjects, listObjectsForCase, CaseObjectSummary } from './s3';
import type { CaseSummary, CaseStatus } from '../types/case';
import {
  CASE_METADATA_FILENAME,
  pickTags,
  pickCreatorName,
  prettifyCaseId,
  hashCaseId,
  readCaseMetadataFromKey,
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
  const evidenceCount = await countEvidence(group.csvKey);
  const fallbackTitle = prettifyCaseId(group.id);
  const fallbackUpdatedAt = group.updatedAt ?? new Date().toISOString();
  const fallbackCreatedAt = group.createdAt ?? fallbackUpdatedAt;
  const hash = hashCaseId(group.id);
  const metadata = group.metadataKey ? await readCaseMetadataFromKey(group.metadataKey, group.id) : null;
  const title = metadata?.title ?? fallbackTitle;
  const updatedAt = metadata?.updatedAt ?? fallbackUpdatedAt;
  const createdAt = metadata?.createdAt ?? fallbackCreatedAt;
  const description = metadata?.description ?? buildDescription(title, group.files, evidenceCount);
  const status = metadata?.status ?? deriveStatus(evidenceCount, updatedAt, hash);
  const createdBy = metadata?.createdBy ?? pickCreatorName(group.id);
  const tags = metadata?.tags?.length ? metadata.tags : pickTags(group.id);
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

async function countEvidence(key?: string): Promise<number> {
  if (!key) return 0;
  try {
    const buf = await getObjectBuffer(key);
    const data = parseCSV(buf.toString('utf-8'));
    return Array.isArray(data) ? data.length : 0;
  } catch (err) {
    console.warn('Failed to read evidence CSV', err);
    return 0;
  }
}

function buildDescription(title: string, files: string[], evidenceCount: number) {
  const assetSummary = files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : 'files';
  const evidenceSummary = evidenceCount === 1 ? '1 marker recorded' : `${evidenceCount} markers recorded`;
  return `${title} includes ${assetSummary} in S3 with ${evidenceSummary}.`;
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
