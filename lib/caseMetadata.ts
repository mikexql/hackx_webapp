import { buildCaseObjectKey, getObjectBuffer, putObjectBuffer } from './s3';
import type { CaseMetadata, CaseStatus } from '../types/case';

export const CASE_METADATA_FILENAME = 'metadata.json';

const CREATOR_NAMES = [
  'Det. Marisol Chen',
  'Det. Imani Price',
  'Det. Rafael Ortiz',
  'Det. Lena Gupta',
  'Det. Ezra Miles',
  'Det. Cole Ramirez',
];

const TAG_POOL = ['forensics', 'field', 'vault', 'metro', 'night-shift', 'intel', 'suspect-track'];

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

export function pickCreatorName(id: string) {
  const hash = hashCaseId(id);
  return CREATOR_NAMES[hash % CREATOR_NAMES.length];
}

export function pickTags(id: string) {
  const seed = hashCaseId(id);
  const first = TAG_POOL[seed % TAG_POOL.length];
  const second = TAG_POOL[(seed + 3) % TAG_POOL.length];
  return Array.from(new Set([first, second]));
}

export function createDefaultMetadata(caseId: string, overrides?: Partial<CaseMetadata>): CaseMetadata {
  const now = new Date().toISOString();
  const overrideTags = Array.isArray(overrides?.tags) ? normalizeTags(overrides?.tags as string[]) : undefined;
  return {
    id: overrides?.id?.trim() || caseId,
    title: overrides?.title?.trim() || prettifyCaseId(caseId),
    description: overrides?.description?.trim() || `Case file ${caseId} metadata`,
    status: (overrides?.status as CaseStatus) || 'open',
    createdBy: overrides?.createdBy?.trim() || pickCreatorName(caseId),
    createdAt: overrides?.createdAt || now,
    updatedAt: overrides?.updatedAt || now,
    tags: overrideTags && overrideTags.length ? overrideTags : pickTags(caseId),
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

export async function upsertCaseMetadata(caseId: string, patch: CaseMetadataPatch): Promise<CaseMetadata> {
  const base = (await readCaseMetadata(caseId)) ?? createDefaultMetadata(caseId);
  const normalizedTags = patch.tags && patch.tags.length ? normalizeTags(patch.tags) : undefined;
  const merged: CaseMetadata = {
    ...base,
    ...patch,
    tags: normalizedTags && normalizedTags.length ? normalizedTags : base.tags,
    updatedAt: new Date().toISOString(),
  };
  const normalized = normalizeMetadata(merged, caseId);
  if (!normalized) throw new Error('Failed to normalize metadata patch');
  await writeCaseMetadata(caseId, normalized);
  return normalized;
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
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : defaults.createdAt,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : defaults.updatedAt,
    tags: Array.isArray(raw.tags) && raw.tags.length ? normalizeTags(raw.tags) : defaults.tags,
  };
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
