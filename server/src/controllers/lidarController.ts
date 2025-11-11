import { Request, Response } from "express";
import path from "path";
import { promises as fs } from "fs";
import os from "os";
import crypto from "crypto";
import { execFile } from "child_process";

// Path to the Python interpreter inside the venv
const PYTHON_PATH = path.resolve(__dirname, "../../.venv/bin/python");

// Run the LIDAR processor on an image buffer
async function runLidarProcessor(
    imageBuffer: Buffer,
    debug: boolean = false
): Promise<{
    processed: Buffer;
    edges: Buffer | null;
    stdout?: string;
}> {
    const tmpDir = os.tmpdir();
    const id = crypto.randomBytes(6).toString("hex");
    const inputPath = path.join(tmpDir, `lidar-${id}.png`);
    const outputDir = path.join(tmpDir, `lidar-${id}-out`);

    // 1. create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // 2. write the image to a temp file
    await fs.writeFile(inputPath, imageBuffer);

    // 3. run the LIDAR processor
    const scriptPath = path.resolve(__dirname, "../../python/lidar_processor.py");
    const args = [scriptPath, inputPath, '--output_dir', outputDir];
    if (debug) args.push('--debug');

    const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
            PYTHON_PATH,
            args,
            (error, stdout, stderr) => {
                if (error) {
                    console.error("LIDAR processor error:", error);
                    console.error("LIDAR processor stderr:", stderr.toString());
                    reject(error);
                } else {
                    if (stdout) {
                        console.log("LIDAR processor stdout:", stdout.toString());
                    }
                    resolve(stdout.toString());
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
    } catch (err) {
        console.warn("Cleanup error:", err);
    }

    return { 
        processed: processedBuffer, 
        edges: edgesBuffer,
        stdout: debug ? stdout : undefined 
    };
}

export const handleLidarProcessing = async (req: Request, res: Response) => {
    try {
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        // Check file type
        const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
            return res.status(400).json({ 
                error: "Invalid file type. Only PNG and JPEG images are supported." 
            });
        }

        const debug = req.body.debug === 'true' || req.query.debug === 'true';

        console.log(`Processing LIDAR map: ${file.originalname}`);
        const result = await runLidarProcessor(file.buffer, debug);

        // Save to uploads directory
        const uploadsDir = path.resolve(__dirname, "../../uploads");
        await fs.mkdir(uploadsDir, { recursive: true });
        
        const baseName = (file.originalname || "lidar").replace(/\.[^.]+$/, "");
        const timestamp = Date.now();
        
        const processedFileName = `${baseName}-processed-${timestamp}.png`;
        const processedFilePath = path.join(uploadsDir, processedFileName);
        await fs.writeFile(processedFilePath, result.processed);

        let edgesFilePath: string | null = null;
        if (result.edges) {
            const edgesFileName = `${baseName}-edges-${timestamp}.png`;
            edgesFilePath = path.join(uploadsDir, edgesFileName);
            await fs.writeFile(edgesFilePath, result.edges);
        }

        const response: any = {
            success: true,
            processedImage: `data:image/png;base64,${result.processed.toString("base64")}`,
            savedProcessedPath: processedFilePath,
        };

        if (result.edges && edgesFilePath) {
            response.edgesImage = `data:image/png;base64,${result.edges.toString("base64")}`;
            response.savedEdgesPath = edgesFilePath;
        }

        if (debug && result.stdout) {
            response.debug = result.stdout;
        }

        res.json(response);
    } catch (err) {
        console.error("LIDAR processing error:", err);
        res.status(500).json({ 
            error: "Failed to process LIDAR map",
            details: err instanceof Error ? err.message : String(err)
        });
    }
};

// Optional: Process an already uploaded file by path
export const handleLidarProcessingByPath = async (req: Request, res: Response) => {
    try {
        const { imagePath } = req.body;
        
        if (!imagePath) {
            return res.status(400).json({ error: "imagePath is required" });
        }

        const debug = req.body.debug === 'true' || req.query.debug === 'true';

        // Read the file
        const imageBuffer = await fs.readFile(imagePath);

        console.log(`Processing LIDAR map from path: ${imagePath}`);
        const result = await runLidarProcessor(imageBuffer, debug);

        // Save processed files next to original
        const dir = path.dirname(imagePath);
        const baseName = path.parse(imagePath).name;
        
        const processedFilePath = path.join(dir, `${baseName}-lidar-processed.png`);
        await fs.writeFile(processedFilePath, result.processed);

        let edgesFilePath: string | null = null;
        if (result.edges) {
            edgesFilePath = path.join(dir, `${baseName}-lidar-edges.png`);
            await fs.writeFile(edgesFilePath, result.edges);
        }

        const response: any = {
            success: true,
            processedImage: `data:image/png;base64,${result.processed.toString("base64")}`,
            savedProcessedPath: processedFilePath,
        };

        if (result.edges && edgesFilePath) {
            response.edgesImage = `data:image/png;base64,${result.edges.toString("base64")}`;
            response.savedEdgesPath = edgesFilePath;
        }

        if (debug && result.stdout) {
            response.debug = result.stdout;
        }

        res.json(response);
    } catch (err) {
        console.error("LIDAR processing error:", err);
        res.status(500).json({ 
            error: "Failed to process LIDAR map",
            details: err instanceof Error ? err.message : String(err)
        });
    }
};