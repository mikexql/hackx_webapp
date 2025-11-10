// src/utils/parsePGM.ts
export default function parsePGM(buf: Buffer) {
    // Helper to read ASCII token-by-token while handling comments (#...)
    let idx = 0;
    const readByte = () => buf[idx++];
    const peekByte = () => buf[idx];
    const isWhitespace = (b: number) => b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;

    function readTokenAscii(): string {
        // skip whitespace and comments
        while (idx < buf.length) {
            const b = peekByte();
            if (isWhitespace(b)) { idx++; continue; }
            if (b === 0x23) { // '#'
                // skip until newline
                while (idx < buf.length && readByte() !== 0x0a) { }
                continue;
            }
            break;
        }
        // read token
        let start = idx;
        while (idx < buf.length && !isWhitespace(peekByte())) idx++;
        return buf.toString("ascii", start, idx);
    }

    // Read magic
    const magic = readTokenAscii(); // P2 or P5
    if (magic !== "P2" && magic !== "P5") {
        throw new Error("Unsupported PGM format or invalid header (expected P2 or P5), got: " + magic);
    }

    // Read width, height, maxVal
    const widthStr = readTokenAscii();
    const heightStr = readTokenAscii();
    const maxValStr = readTokenAscii();

    const width = parseInt(widthStr, 10);
    const height = parseInt(heightStr, 10);
    const maxVal = parseInt(maxValStr, 10);

    if (Number.isNaN(width) || Number.isNaN(height) || Number.isNaN(maxVal)) {
        throw new Error("Invalid PGM header numbers");
    }

    // idx now points to the byte after the maxVal token — for P5, pixel bytes begin at idx (maybe after a single newline)
    // Skip a single whitespace if present (common after header)
    if (isWhitespace(peekByte())) idx++;

    if (magic === "P5") {
        // binary: each pixel is one byte (if maxVal < 256). If maxVal > 255 it could be 2 bytes per sample (rare).
        const expected = width * height;
        const remaining = buf.length - idx;
        if (remaining < expected) {
            // Some implementations may pad or have different encodings; still try to read available bytes
            console.warn(`PGM P5: expected ${expected} bytes, got ${remaining}`);
        }
        const pixels: number[] = [];
        const end = Math.min(buf.length, idx + expected);
        for (let i = idx; i < end; i++) {
            pixels.push(buf[i]);
        }
        return { width, height, maxVal, pixels };
    } else {
        // P2 ASCII: read tokens for width*height integer values
        const pixels: number[] = [];
        while (pixels.length < width * height && idx < buf.length) {
            const tok = readTokenAscii();
            if (!tok) break;
            const v = parseInt(tok, 10);
            if (!Number.isNaN(v)) pixels.push(v);
        }
        return { width, height, maxVal, pixels };
    }
}
