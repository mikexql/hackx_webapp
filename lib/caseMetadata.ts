import { buildCaseObjectKey, getObjectBuffer, putObjectBuffer } from './s3';
import type { CaseMetadata, CaseStatus } from '../types/case';

export const CASE_METADATA_FILENAME = 'metadata.json';

export function hashCaseId(id: string) {
  return Array.from(id).reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

export function prettifyCaseId(id: string) {
  return id
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function createDefaultMetadata(caseId: string, overrides?: Partial<CaseMetadata>): CaseMetadata {
  const now = new Date().toISOString();
  const overrideTags = Array.isArray(overrides?.tags) ? normalizeTags(overrides?.tags as string[]) : undefined;
  const baseCaseDate = parseCaseIdTimestamp(caseId) ?? new Date(now);
  const createdAt = normalizeIso(overrides?.createdAt, baseCaseDate.toISOString());
  const updatedAt = normalizeIso(overrides?.updatedAt, now);
  return {
    id: overrides?.id?.trim() || caseId,
    title: overrides?.title?.trim() || prettifyCaseId(caseId),
    description: overrides?.description?.trim() || '-',
    status: (overrides?.status as CaseStatus) || 'open',
    createdBy: overrides?.createdBy?.trim() || '-',
    createdAt,
    updatedAt,
    tags: overrideTags && overrideTags.length ? overrideTags : [],
  };
}

export async function readCaseMetadata(caseId: string): Promise<CaseMetadata | null> {
  const key = buildCaseObjectKey(caseId, CASE_METADATA_FILENAME);
  return readCaseMetadataFromKey(key, caseId);
}

export async function readCaseMetadataFromKey(key: string, caseId: string): Promise<CaseMetadata | null> {
  try {
    const buf = await getObjectBuffer(key);
    const data = JSON.parse(buf.toString('utf-8'));
    return normalizeMetadata(data, caseId);
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey') {
      return null;
    }
    console.warn('Failed to read case metadata', err);
    return null;
  }
}

export async function writeCaseMetadata(caseId: string, metadata: CaseMetadata) {
  const normalized = normalizeMetadata(metadata, caseId);
  if (!normalized) throw new Error('Invalid metadata payload');
  const key = buildCaseObjectKey(caseId, CASE_METADATA_FILENAME);
  const buffer = Buffer.from(JSON.stringify(normalized, null, 2), 'utf-8');
  await putObjectBuffer(key, buffer, 'application/json');
}

export async function ensureMetadataFile(caseId: string, overrides?: Partial<CaseMetadata>) {
  const existing = await readCaseMetadata(caseId);
  if (existing) return existing;
  const metadata = createDefaultMetadata(caseId, overrides);
  await writeCaseMetadata(caseId, metadata);
  return metadata;
}

export type CaseMetadataPatch = Partial<Pick<CaseMetadata, 'title' | 'description' | 'status' | 'createdBy' | 'tags'>>;

export type CaseMetadataUpsertOptions = {
  createdAt?: string;
};

export async function upsertCaseMetadata(caseId: string, patch: CaseMetadataPatch, options?: CaseMetadataUpsertOptions): Promise<CaseMetadata> {
  const baseOverrides = options?.createdAt ? { createdAt: options.createdAt } : undefined;
  const base = (await readCaseMetadata(caseId)) ?? createDefaultMetadata(caseId, baseOverrides);
  const normalizedTags = patch.tags && patch.tags.length ? normalizeTags(patch.tags) : undefined;
  const createdAt = options?.createdAt ?? base.createdAt;
  const merged: CaseMetadata = {
    ...base,
    ...patch,
    tags: normalizedTags && normalizedTags.length ? normalizedTags : base.tags,
    createdAt,
    updatedAt: new Date().toISOString(),
  };
  const normalized = normalizeMetadata(merged, caseId);
  if (!normalized) throw new Error('Failed to normalize metadata patch');
  await writeCaseMetadata(caseId, normalized);
  return normalized;
}

export async function setCreatedAtIfEarlier(caseId: string, createdAtIso: string): Promise<CaseMetadata> {
  const existing = await readCaseMetadata(caseId);
  if (!existing) {
    const metadata = createDefaultMetadata(caseId, { createdAt: createdAtIso });
    await writeCaseMetadata(caseId, metadata);
    return metadata;
  }
  if (!existing.createdAt || isIsoAfter(existing.createdAt, createdAtIso)) {
    const updated: CaseMetadata = { ...existing, createdAt: createdAtIso };
    await writeCaseMetadata(caseId, updated);
    return updated;
  }
  return existing;
}

function normalizeMetadata(raw: any, caseId: string): CaseMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const defaults = createDefaultMetadata(caseId);
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : defaults.id,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : defaults.title,
    description: typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : defaults.description,
    status: isValidStatus(raw.status) ? raw.status : defaults.status,
    createdBy: typeof raw.createdBy === 'string' && raw.createdBy.trim() ? raw.createdBy.trim() : defaults.createdBy,
    createdAt: normalizeIso(raw.createdAt, defaults.createdAt),
    updatedAt: normalizeIso(raw.updatedAt, defaults.updatedAt),
    tags: Array.isArray(raw.tags) && raw.tags.length ? normalizeTags(raw.tags) : defaults.tags,
  };
}

export function parseCaseIdTimestamp(caseId: string): Date | null {
  const match = caseId.match(/case_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTags(tags: unknown[]): string[] {
  return Array.from(new Set(
    tags
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean)
  ));
}

function isValidStatus(value: any): value is CaseStatus {
  return value === 'open' || value === 'in-progress' || value === 'closed' || value === 'archived';
}

function normalizeIso(value: unknown, fallbackIso: string): string {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const fallback = new Date(fallbackIso);
  return Number.isNaN(fallback.getTime()) ? new Date().toISOString() : fallback.toISOString();
}

function isIsoAfter(leftIso: string, rightIso: string): boolean {
  const left = new Date(leftIso).getTime();
  const right = new Date(rightIso).getTime();
  return left > right;
}
