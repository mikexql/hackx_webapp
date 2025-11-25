// Copied and adapted from server utils
export default function parsePGM(buf: Buffer) {
    let idx = 0;
    const readByte = () => buf[idx++];
    const peekByte = () => buf[idx];
    const isWhitespace = (b: number) => b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;

    function readTokenAscii(): string {
        while (idx < buf.length) {
            const b = peekByte();
            if (isWhitespace(b)) { idx++; continue; }
            if (b === 0x23) { // '#'
                while (idx < buf.length && readByte() !== 0x0a) { }
                continue;
            }
            break;
        }
        let start = idx;
        while (idx < buf.length && !isWhitespace(peekByte())) idx++;
        return buf.toString("ascii", start, idx);
    }

    const magic = readTokenAscii();
    if (magic !== "P2" && magic !== "P5") {
        throw new Error("Unsupported PGM format or invalid header (expected P2 or P5), got: " + magic);
    }

    const widthStr = readTokenAscii();
    const heightStr = readTokenAscii();
    const maxValStr = readTokenAscii();

    const width = parseInt(widthStr, 10);
    const height = parseInt(heightStr, 10);
    const maxVal = parseInt(maxValStr, 10);

    if (Number.isNaN(width) || Number.isNaN(height) || Number.isNaN(maxVal)) {
        throw new Error("Invalid PGM header numbers");
    }

    if (isWhitespace(peekByte())) idx++;

    if (magic === "P5") {
        const expected = width * height;
        const remaining = buf.length - idx;
        if (remaining < expected) {
            console.warn(`PGM P5: expected ${expected} bytes, got ${remaining}`);
        }
        const pixels: number[] = [];
        const end = Math.min(buf.length, idx + expected);
        for (let i = idx; i < end; i++) {
            pixels.push(buf[i]);
        }
        return { width, height, maxVal, pixels };
    } else {
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
