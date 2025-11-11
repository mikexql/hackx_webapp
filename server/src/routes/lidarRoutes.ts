import { Router } from "express";
import multer from "multer";
import { handleLidarProcessing, handleLidarProcessingByPath } from "../controllers/lidarController";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Upload and process a new LIDAR map
router.post(
    "/process",
    upload.single("map"),
    handleLidarProcessing
);

// Process an already uploaded file by path
router.post(
    "/process-existing",
    handleLidarProcessingByPath
);

export default router;