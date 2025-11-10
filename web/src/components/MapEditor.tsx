import { useRef, useEffect, useState } from "react";
import type { Evidence, MapData } from "../types/types";

interface MapEditorProps {
    baseImage: string;
    mapData: MapData;
    evidence: Evidence[];
    onEvidenceUpdate: (evidence: Evidence[]) => void;
}

export default function MapEditor({
    baseImage,
    mapData,
    evidence,
    onEvidenceUpdate,
}: MapEditorProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [scale, setScale] = useState(2);
    const [imageLoaded, setImageLoaded] = useState<HTMLImageElement | null>(null);

    const scaledWidth = mapData.width * scale;
    const scaledHeight = mapData.height * scale;
    const selectedEvidence = evidence.find((e) => e.id === selectedId);

    // Load image
    useEffect(() => {
        const img = new Image();
        img.src = baseImage;
        img.onload = () => setImageLoaded(img);
    }, [baseImage]);

    // Draw everything
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imageLoaded) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, scaledWidth, scaledHeight);
        ctx.drawImage(imageLoaded, 0, 0, scaledWidth, scaledHeight);

        // Draw contours
        ctx.strokeStyle = "rgba(0, 100, 255, 0.5)";
        ctx.lineWidth = 1;
        for (const contour of mapData.contours) {
            ctx.beginPath();
            contour.forEach((p, i) => {
                const x = p.x * scale;
                const y = p.y * scale;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.stroke();
        }

        // Draw markers
        for (const e of evidence) {
            const x = e.pixel.x * scale;
            const y = e.pixel.y * scale;
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, 2 * Math.PI);
            ctx.fillStyle = selectedId === e.id ? "#ffeb3b" : "#f44336";
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
        }
    }, [evidence, imageLoaded, selectedId, scale, mapData]);

    // Handle click and drag
    const getMarkerAt = (x: number, y: number) => {
        const r = 8 * scale; // effective radius
        return evidence.find(
            (e) =>
                Math.hypot(x - e.pixel.x * scale, y - e.pixel.y * scale) <=
                r
        );
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hit = getMarkerAt(x, y);

        if (hit) {
            setSelectedId(hit.id);
            setDraggingId(hit.id);
        } else {
            setSelectedId(null);
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!draggingId || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const updated = evidence.map((ev) =>
            ev.id === draggingId
                ? { ...ev, pixel: { x: x / scale, y: y / scale } }
                : ev
        );
        onEvidenceUpdate(updated);
    };

    const handleMouseUp = () => {
        setDraggingId(null);
    };

    // Add / Delete / Update
    const handleAddMarker = () => {
        const newEvidence: Evidence = {
            id: `marker-${Date.now()}`,
            x: "0",
            y: "0",
            time: new Date().toLocaleTimeString(),
            pixel: { x: mapData.width / 2, y: mapData.height / 2 },
            label: "New Marker",
            category: "uncategorized",
            notes: "",
        };
        onEvidenceUpdate([...evidence, newEvidence]);
        setSelectedId(newEvidence.id);
    };

    const handleDelete = () => {
        if (selectedId) {
            onEvidenceUpdate(evidence.filter((e) => e.id !== selectedId));
            setSelectedId(null);
        }
    };

    const updateField = (field: keyof Evidence, value: string) => {
        if (!selectedId) return;
        const updated = evidence.map((e) =>
            e.id === selectedId ? { ...e, [field]: value } : e
        );
        onEvidenceUpdate(updated);
    };

    const handleExport = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = "annotated-map.png";
        a.click();
    };

    return (
        <div style={{ display: "flex", gap: "20px", padding: "20px" }}>
            {/* Canvas */}
            <div style={{ flex: 1 }}>
                <div style={{ marginBottom: "10px" }}>
                    <label>Zoom: </label>
                    <input
                        type="range"
                        min="1"
                        max="4"
                        step="0.5"
                        value={scale}
                        onChange={(e) => setScale(Number(e.target.value))}
                    />
                    <span>{scale}x</span>
                    <button onClick={handleAddMarker} style={{ marginLeft: "20px" }}>
                        Add Marker
                    </button>
                    <button
                        onClick={handleExport}
                        style={{
                            marginLeft: "20px",
                            backgroundColor: "#2196f3",
                            color: "white",
                            padding: "6px 10px",
                            borderRadius: "4px",
                            border: "none",
                        }}
                    >
                        Download Map
                    </button>
                    <span style={{ marginLeft: "20px", color: "#666" }}>
                        Total markers: {evidence.length}
                    </span>
                </div>
                <canvas
                    ref={canvasRef}
                    width={scaledWidth}
                    height={scaledHeight}
                    style={{
                        border: "2px solid #ccc",
                        backgroundColor: "#f0f0f0",
                        cursor: draggingId ? "grabbing" : "pointer",
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                />
            </div>

            {/* Editor Panel */}
            <div
                style={{
                    width: "300px",
                    padding: "20px",
                    border: "1px solid #ccc",
                    backgroundColor: "#f9f9f9",
                    borderRadius: "8px",
                }}
            >
                <h3>Marker Editor</h3>
                {selectedEvidence ? (
                    <>
                        <p style={{ fontSize: "12px", color: "#777" }}>
                            ID: {selectedEvidence.id}
                        </p>
                        <div style={{ marginBottom: "10px" }}>
                            <label>Label</label>
                            <input
                                value={selectedEvidence.label}
                                onChange={(e) => updateField("label", e.target.value)}
                                style={{ width: "100%" }}
                            />
                        </div>
                        <div style={{ marginBottom: "10px" }}>
                            <label>Category</label>
                            <input
                                value={selectedEvidence.category}
                                onChange={(e) => updateField("category", e.target.value)}
                                style={{ width: "100%" }}
                            />
                        </div>
                        <div style={{ marginBottom: "10px" }}>
                            <label>Notes</label>
                            <textarea
                                value={selectedEvidence.notes}
                                onChange={(e) => updateField("notes", e.target.value)}
                                rows={4}
                                style={{ width: "100%" }}
                            />
                        </div>
                        <p style={{ color: "#666" }}>
                            x: {selectedEvidence.pixel.x.toFixed(1)}, y:{" "}
                            {selectedEvidence.pixel.y.toFixed(1)}
                        </p>
                        <button
                            onClick={handleDelete}
                            style={{
                                width: "100%",
                                backgroundColor: "#f44336",
                                color: "white",
                                padding: "8px",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                            }}
                        >
                            Delete Marker
                        </button>
                    </>
                ) : (
                    <p style={{ color: "#999" }}>Click a marker to edit or move</p>
                )}
            </div>
        </div>
    );
}
