import express from "express";
import uploadRoutes from "./routes/uploadRoutes";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use("/api/upload", uploadRoutes);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
