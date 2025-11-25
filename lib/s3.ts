import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION || "us-east-1";
const BUCKET = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
const PREFIX = process.env.S3_PREFIX || ""; // optional prefix where cases live

if (!BUCKET) {
    // don't throw at import time; routes will check
}

const client = new S3Client({ region: REGION });

async function streamToBuffer(stream: any): Promise<Buffer> {
    // Node readable stream to Buffer
    return new Promise((resolve, reject) => {
        const chunks: any[] = [];
        stream.on('data', (chunk: any) => chunks.push(Buffer.from(chunk)));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

export async function listCaseIds(): Promise<string[]> {
    if (!BUCKET) throw new Error('S3_BUCKET not configured');
    const command = new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX });
    const out = await client.send(command);
    const keys = (out.Contents || []).map(o => o.Key || '').filter(Boolean);
    // Assume case layout: `<prefix>/<caseId>/...` or filenames include caseId; extract first path segment after prefix
    const ids = new Set<string>();
    for (const k of keys) {
        const relative = PREFIX && k.startsWith(PREFIX) ? k.slice(PREFIX.length) : k;
        const parts = relative.replace(/^\/+/, '').split('/');
        if (parts.length) ids.add(parts[0]);
    }
    return Array.from(ids).sort();
}

export async function listObjectsForCase(caseId: string): Promise<string[]> {
    if (!BUCKET) throw new Error('S3_BUCKET not configured');
    const casePrefix = `${PREFIX}${caseId}/`;
    const command = new ListObjectsV2Command({ Bucket: BUCKET, Prefix: casePrefix });
    const out = await client.send(command);
    const keys = (out.Contents || []).map(o => o.Key || '').filter(Boolean);
    return keys;
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
    if (!BUCKET) throw new Error('S3_BUCKET not configured');
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const out = await client.send(command);
    // @ts-ignore
    const body = out.Body;
    if (!body) throw new Error('S3 object has empty body');
    return await streamToBuffer(body as any);
}

export async function putObjectBuffer(key: string, buffer: Buffer, contentType = 'text/csv') {
    if (!BUCKET) throw new Error('S3_BUCKET not configured');
    const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType });
    await client.send(cmd);
}
