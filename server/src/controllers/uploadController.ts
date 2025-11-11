import { Request, Response } from "express";
import parsePGM from "../utils/parsePGM";
import parseYAML from "../utils/parseYAML";
import parseCSV from "../utils/parseCSV";
import path from "path";
import { promises as fs } from "fs";
import { getContours, convertEvidenceToPixels, pgmToPNGBuffer, type Point } from "../utils/mapUtils";
import os from "os";
import crypto from "crypto";
import { execFile } from "child_process";

type MulterFiles = { [fieldname: string]: Express.Multer.File[] | undefined };

// Path to the Python interpreter inside the venv
const PYTHON_PATH = path.resolve(__dirname, "../../.venv/bin/python");

// Run the LIDAR processor on a PGM buffer and get back processed PNG + edges buffers
async function runLidarProcessor(pgmBuffer: Buffer): Promise<{
    processed: Buffer;
    edges: Buffer | null;
}> {
    const tmpDir = os.tmpdir();
    const id = crypto.randomBytes(6).toString("hex");
    const inputPath = path.join(tmpDir, `map-${id}.pgm`);
    const outputDir = path.join(tmpDir, `lidar-${id}-out`);

    // 1. create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // 2. write the PGM to a temp file
    await fs.writeFile(inputPath, pgmBuffer);

    // 3. run the LIDAR processor
    const scriptPath = path.resolve(__dirname, "../../python/lidar_processor.py");

    await new Promise<void>((resolve, reject) => {
        execFile(
            PYTHON_PATH,
            [scriptPath, inputPath, '--output_dir', outputDir, '--debug'],
            (error, stdout, stderr) => {
                if (error) {
                    console.error("LIDAR processor error:", error);
                    console.error("LIDAR processor stderr:", stderr.toString());
                    reject(error);
                } else {
                    if (stdout) {
                        console.log("LIDAR processor stdout:", stdout.toString());
                    }
                    resolve();
                }
            }
        );
    });

    // 4. read the processed files back
    const baseName = path.parse(inputPath).name;
    const processedPath = path.join(outputDir, `${baseName}_processed.png`);
    const edgesPath = path.join(outputDir, `${baseName}_edges.png`);

    const processedBuffer = await fs.readFile(processedPath);
    let edgesBuffer: Buffer | null = null;
    
    try {
        edgesBuffer = await fs.readFile(edgesPath);
    } catch {
        console.warn("Edges file not found, skipping");
    }

    // 5. cleanup temp files
    try {
        await fs.unlink(inputPath);
        await fs.unlink(processedPath);
        if (edgesBuffer) await fs.unlink(edgesPath);
        await fs.rmdir(outputDir);
    } catch {
        // ignore cleanup errors
    }

    return { processed: processedBuffer, edges: edgesBuffer };
}

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

        // Use LIDAR processor to clean the map
        // If it fails, fall back to raw PGM -> PNG
        let pngBuffer: Buffer;
        let edgesBuffer: Buffer | null = null;
        
        try {
            console.log("Running LIDAR processor...");
            const lidarResult = await runLidarProcessor(mapFile.buffer);
            pngBuffer = lidarResult.processed;
            edgesBuffer = lidarResult.edges;
        } catch (e) {
            console.warn("LIDAR processor failed, falling back to raw PGM -> PNG:", e);
            pngBuffer = await pgmToPNGBuffer(pgm.pixels, pgm.width, pgm.height);
        }

        const uploadsDir = path.resolve(__dirname, "../../uploads");
        await fs.mkdir(uploadsDir, { recursive: true });
        const baseName = (mapFile?.originalname || "map").replace(/\.[^.]+$/, "");
        const fileName = `${baseName}-${Date.now()}.png`;
        const filePath = path.join(uploadsDir, fileName);
        await fs.writeFile(filePath, pngBuffer);

        // Save edges if available
        let edgesFilePath: string | null = null;
        if (edgesBuffer) {
            const edgesFileName = `${baseName}-${Date.now()}-edges.png`;
            edgesFilePath = path.join(uploadsDir, edgesFileName);
            await fs.writeFile(edgesFilePath, edgesBuffer);
        }

        const response: any = {
            success: true,
            map: {
                width: pgm.width,
                height: pgm.height,
                contours
            },
            evidence: evidencePixels,
            baseImage: `data:image/png;base64,${pngBuffer.toString("base64")}`,
            savedImagePath: filePath
        };

        // Add edges image if available
        if (edgesBuffer && edgesFilePath) {
            response.edgesImage = `data:image/png;base64,${edgesBuffer.toString("base64")}`;
            response.savedEdgesPath = edgesFilePath;
        }

        res.json(response);
    } catch (err) {
        console.error("Upload handler error:", err);
        res.status(500).json({ error: "Failed to parse files" });
    }
};