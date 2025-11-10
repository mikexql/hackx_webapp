import { Router } from "express";
import multer from "multer";
import { handleUpload } from "../controllers/uploadController";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// accept named fields map, meta, evidence (all optional except map)
router.post(
    "/",
    upload.fields([
        { name: "map", maxCount: 1 },
        { name: "meta", maxCount: 1 },
        { name: "evidence", maxCount: 1 },
    ]),
    handleUpload
);

export default router;
