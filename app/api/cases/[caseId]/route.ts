import { NextResponse } from 'next/server';
import { listObjectsForCase, getObjectBuffer } from '../../../../lib/s3';
import parsePGM from '../../../../lib/parsePGM';
import parseYAML from '../../../../lib/parseYAML';
import parseCSV from '../../../../lib/parseCSV';
import { getContours, convertEvidenceToPixels, pgmToPNGBuffer } from '../../../../lib/mapUtils';

export async function GET(request: Request, context: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await context.params;
    const keys = await listObjectsForCase(caseId);
    if (!keys.length) return NextResponse.json({ error: 'No files found for case' }, { status: 404 });

    // Find files by extension
    const pgmKey = keys.find(k => k.toLowerCase().endsWith('.pgm'));
    const yamlKey = keys.find(k => k.toLowerCase().endsWith('.yaml') || k.toLowerCase().endsWith('.yml'));
    const csvKey = keys.find(k => k.toLowerCase().endsWith('.csv'));

    if (!pgmKey || !yamlKey) return NextResponse.json({ error: 'PGM and YAML required' }, { status: 400 });

    const [pgmBuf, yamlBuf, csvBuf] = await Promise.all([
      getObjectBuffer(pgmKey),
      getObjectBuffer(yamlKey),
      csvKey ? getObjectBuffer(csvKey) : Promise.resolve(Buffer.from(''))
    ]);

    const pgm = parsePGM(pgmBuf);
    const yaml = parseYAML(yamlBuf.toString('utf-8'));
    const evidence = csvKey ? parseCSV(csvBuf.toString('utf-8')) : [];

    let contours: any[] = [];
    try { contours = getContours(pgm.pixels, pgm.width, pgm.height); } catch (_) { contours = []; }

    const evidencePixels = convertEvidenceToPixels(evidence, yaml.origin, yaml.resolution, pgm.height);
    const pngBuffer = await pgmToPNGBuffer(pgm.pixels, pgm.width, pgm.height);

    return NextResponse.json({
      success: true,
      map: { width: pgm.width, height: pgm.height, contours },
      evidence: evidencePixels,
      baseImage: `data:image/png;base64,${pngBuffer.toString('base64')}`
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
