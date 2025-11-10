import simplify from "simplify-js";
import sharp from "sharp";

export type Point = { x: number; y: number };

// Minimal marching squares returning polylines
function isoContours(grid: number[][], threshold: number): Point[][] {
    const h = grid.length;
    const w = grid[0].length;
    const segments: { a: Point; b: Point }[] = [];

    const interp = (v1: number, v2: number) => {
        const dv = v2 - v1;
        return dv === 0 ? 0.5 : (threshold - v1) / dv;
    };

    for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w - 1; x++) {
            const tl = grid[y][x];
            const tr = grid[y][x + 1];
            const bl = grid[y + 1][x];
            const br = grid[y + 1][x + 1];
            const idx =
                (tl >= threshold ? 8 : 0) |
                (tr >= threshold ? 4 : 0) |
                (br >= threshold ? 2 : 0) |
                (bl >= threshold ? 1 : 0);
            if (idx === 0 || idx === 15) continue;

            const top: Point = { x: x + interp(tl, tr), y };
            const right: Point = { x: x + 1, y: y + interp(tr, br) };
            const bottom: Point = { x: x + interp(bl, br), y: y + 1 };
            const left: Point = { x, y: y + interp(tl, bl) };

            switch (idx) {
                case 1:
                case 14: segments.push({ a: left, b: bottom }); break;
                case 2:
                case 13: segments.push({ a: bottom, b: right }); break;
                case 3:
                case 12: segments.push({ a: left, b: right }); break;
                case 4:
                case 11: segments.push({ a: top, b: right }); break;
                case 5:
                    segments.push({ a: top, b: left });
                    segments.push({ a: bottom, b: right });
                    break;
                case 10:
                    segments.push({ a: top, b: right });
                    segments.push({ a: left, b: bottom });
                    break;
                case 6:
                case 9: segments.push({ a: top, b: bottom }); break;
                case 7:
                case 8: segments.push({ a: top, b: left }); break;
            }
        }
    }

    const unused = [...segments];
    const contours: Point[][] = [];
    while (unused.length) {
        const s = unused.pop()!;
        const line: Point[] = [s.a, s.b];
        let extended = true;
        while (extended) {
            extended = false;
            for (let i = 0; i < unused.length; i++) {
                const seg = unused[i];
                const head = line[0];
                const tail = line[line.length - 1];
                if (seg.a.x === tail.x && seg.a.y === tail.y) {
                    line.push(seg.b); unused.splice(i, 1); extended = true; break;
                } else if (seg.b.x === tail.x && seg.b.y === tail.y) {
                    line.push(seg.a); unused.splice(i, 1); extended = true; break;
                } else if (seg.a.x === head.x && seg.a.y === head.y) {
                    line.unshift(seg.b); unused.splice(i, 1); extended = true; break;
                } else if (seg.b.x === head.x && seg.b.y === head.y) {
                    line.unshift(seg.a); unused.splice(i, 1); extended = true; break;
                }
            }
        }
        contours.push(line);
    }
    return contours;
}

export function getContours(
    pixels: number[],
    width: number,
    height: number,
    threshold = 127
): Point[][] {
    const grid: number[][] = [];
    for (let y = 0; y < height; y++) {
        grid.push(pixels.slice(y * width, (y + 1) * width));
    }
    const raw = isoContours(grid, threshold);
    return raw.map(poly => simplify(poly, 1, true)) as Point[][];
}

export function worldToPixel(
    x_world: number,
    y_world: number,
    origin: [number, number, number],
    resolution: number,
    height: number
): Point {
    const [ox, oy] = origin;
    const px = Math.round((x_world - ox) / resolution);
    const py = height - Math.round((y_world - oy) / resolution);
    return { x: px, y: py };
}

export function convertEvidenceToPixels(
    evidence: any[],
    origin: [number, number, number],
    resolution: number,
    height: number
) {
    return evidence.map(e => ({
        ...e,
        pixel: worldToPixel(Number(e.x), Number(e.y), origin, resolution, height)
    }));
}

export async function pgmToPNGBuffer(
    pixels: number[],
    width: number,
    height: number
): Promise<Buffer> {
    const arr = Uint8Array.from(pixels);
    return sharp(arr, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

export async function drawMarkersOnPNG(
    basePngBuffer: Buffer,
    markers: Point[],
    markerSize = 5,
    color = { r: 255, g: 0, b: 0 } // red
): Promise<Buffer> {
    const base = sharp(basePngBuffer);
    const metadata = await base.metadata();
    const width = metadata.width!;
    const height = metadata.height!;

    // Convert grayscale to RGB so we can add colored markers
    const rgbBase = await base.toColorspace('srgb').toBuffer();

    // Create SVG overlays for each marker (circles)
    const svgCircles = markers
        .filter(m => m.x >= 0 && m.x < width && m.y >= 0 && m.y < height)
        .map(m =>
            `<circle cx="${m.x}" cy="${m.y}" r="${markerSize}" fill="rgb(${color.r},${color.g},${color.b})" stroke="white" stroke-width="1"/>`
        )
        .join('');

    const svg = `<svg width="${width}" height="${height}">
        ${svgCircles}
    </svg>`;

    const svgBuffer = Buffer.from(svg);

    return sharp(rgbBase)
        .composite([{ input: svgBuffer, top: 0, left: 0 }])
        .png()
        .toBuffer();
}