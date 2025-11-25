import { parse } from "csv-parse/sync";

export default function parseCSV(content: string) {
    const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });
    return records;
}
