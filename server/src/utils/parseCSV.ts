import { parse } from "csv-parse/sync";

export default function parseCSV(content: string) {
    const records = parse(content, {
        columns: true,        // Use first row as header
        skip_empty_lines: true,
        trim: true
    });
    return records; // Array of objects
}
