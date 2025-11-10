import { Request, Response } from "express";
import parsePGM from "../utils/parsePGM";
import parseYAML from "../utils/parseYAML";
import parseCSV from "../utils/parseCSV";
import path from "path";
import { promises as fs } from "fs";
import { getContours, convertEvidenceToPixels, pgmToPNGBuffer, type Point } from "../utils/mapUtils";

type MulterFiles = { [fieldname: string]: Express.Multer.File[] | undefined };

export const handleUpload = async (req: Request, res: Response) => {
    try {
        const files = (req.files as MulterFiles) ?? {};
        const mapFile = files.map?.[0];
        const metaFile = files.meta?.[0];
        const evidenceFile = files.evidence?.[0];

        if (!mapFile) return res.status(400).json({ error: "map file is required" });
        if (!metaFile) return res.status(400).json({ error: "meta file is required" });

        const pgm = parsePGM(mapFile.buffer);
        const yaml = parseYAML(metaFile.buffer.toString("utf-8"));
        const evidence = evidenceFile ? parseCSV(evidenceFile.buffer.toString("utf-8")) : [];

        let contours: Point[][] = [];
        try {
            contours = getContours(pgm.pixels, pgm.width, pgm.height);
        } catch {
            contours = [];
        }

        const evidencePixels = convertEvidenceToPixels(
            evidence,
            yaml.origin,
            yaml.resolution,
            pgm.height
        );

        // Convert PGM to base PNG WITHOUT markers (they'll be drawn in frontend)
        const pngBuffer = await pgmToPNGBuffer(pgm.pixels, pgm.width, pgm.height);

        const uploadsDir = path.resolve(__dirname, "../../uploads");
        await fs.mkdir(uploadsDir, { recursive: true });
        const baseName = (mapFile?.originalname || "map").replace(/\.[^.]+$/, "");
        const fileName = `${baseName}-${Date.now()}.png`;
        const filePath = path.join(uploadsDir, fileName);
        await fs.writeFile(filePath, pngBuffer);

        res.json({
            success: true,
            map: {
                width: pgm.width,
                height: pgm.height,
                contours
            },
            evidence: evidencePixels,
            baseImage: `data:image/png;base64,${pngBuffer.toString("base64")}`,
            savedImagePath: filePath
        });
    } catch (err) {
        console.error("Upload handler error:", err);
        res.status(500).json({ error: "Failed to parse files" });
    }
};