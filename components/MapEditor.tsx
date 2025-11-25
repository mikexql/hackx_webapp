"use client";
import { useRef, useEffect, useState } from "react";
import type { Evidence, MapData } from "@types/types";

interface MapEditorProps {
    baseImage: string;
    mapData: MapData;
    evidence: Evidence[];
    onEvidenceUpdate: (evidence: Evidence[]) => void;
    resolution?: number; // meters per pixel
}

export default function MapEditor({
    baseImage,
    mapData,
    evidence,
    onEvidenceUpdate,
    resolution = 0.05,
}: MapEditorProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [scale, setScale] = useState(2);
    const [imageLoaded, setImageLoaded] = useState<HTMLImageElement | null>(null);

    // Ruler state
    const [rulerMode, setRulerMode] = useState(false);
    const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
    const [rulerEnd, setRulerEnd] = useState<{ x: number; y: number } | null>(null);
    const [distance, setDistance] = useState<number | null>(null);

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

        // Always draw markers (visible in both modes)
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

        // Draw ruler line (overlays on top of markers)
        if (rulerStart) {
            const startX = rulerStart.x * scale;
            const startY = rulerStart.y * scale;

            // Draw start point
            ctx.beginPath();
            ctx.arc(startX, startY, 6, 0, 2 * Math.PI);
            ctx.fillStyle = "#4CAF50";
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.stroke();

            if (rulerEnd) {
                const endX = rulerEnd.x * scale;
                const endY = rulerEnd.y * scale;

                // Draw line
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.strokeStyle = "#4CAF50";
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw end point
                ctx.beginPath();
                ctx.arc(endX, endY, 6, 0, 2 * Math.PI);
                ctx.fillStyle = "#4CAF50";
                ctx.fill();
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2;
                ctx.stroke();

                // Draw distance label
                const midX = (startX + endX) / 2;
                const midY = (startY + endY) / 2;
                ctx.fillStyle = "#000";
                ctx.font = "bold 14px Arial";
                ctx.fillRect(midX - 40, midY - 15, 80, 20);
                ctx.fillStyle = "#fff";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(`${distance?.toFixed(2)}m`, midX, midY);
            }
        }
    }, [evidence, imageLoaded, selectedId, scale, mapData, rulerMode, rulerStart, rulerEnd, distance]);

    // Handle click and drag
    const getMarkerAt = (x: number, y: number) => {
        const r = 8 * scale;
        return evidence.find(
            (e) =>
                Math.hypot(x - e.pixel.x * scale, y - e.pixel.y * scale) <= r
        );
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;

        if (rulerMode) {
            // Ruler mode: set start or end point
            if (!rulerStart) {
                setRulerStart({ x, y });
                setRulerEnd(null);
                setDistance(null);
            } else if (!rulerEnd) {
                setRulerEnd({ x, y });
                // Calculate distance in meters
                const dx = (x - rulerStart.x) * resolution;
                const dy = (y - rulerStart.y) * resolution;
                const dist = Math.sqrt(dx * dx + dy * dy);
                setDistance(dist);
            } else {
                // Reset for new measurement
                setRulerStart({ x, y });
                setRulerEnd(null);
                setDistance(null);
            }
        } else {
            // Marker mode
            const hit = getMarkerAt(e.clientX - rect.left, e.clientY - rect.top);
            if (hit) {
                setSelectedId(hit.id);
                setDraggingId(hit.id);
            } else {
                setSelectedId(null);
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!draggingId || !canvasRef.current || rulerMode) return;
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

    const toggleRulerMode = () => {
        setRulerMode(!rulerMode);
        setRulerStart(null);
        setRulerEnd(null);
        setDistance(null);
        setSelectedId(null);
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
                    <button
                        onClick={toggleRulerMode}
                        style={{
                            marginLeft: "20px",
                            backgroundColor: rulerMode ? "#4CAF50" : "#666",
                            color: "white",
                            padding: "6px 10px",
                            borderRadius: "4px",
                            border: "none",
                            cursor: "pointer",
                        }}
                    >
                        📏 Ruler {rulerMode ? "(ON)" : ""}
                    </button>
                    <button onClick={handleAddMarker} style={{ marginLeft: "10px" }} disabled={rulerMode}>
                        Add Marker
                    </button>
                    <button
                        onClick={handleExport}
                        style={{
                            marginLeft: "10px",
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
                {rulerMode && (
                    <div
                        style={{
                            padding: "10px",
                            backgroundColor: "#e8f5e9",
                            border: "1px solid #4CAF50",
                            borderRadius: "4px",
                            marginBottom: "10px",
                        }}
                    >
                        <strong>Ruler Mode:</strong> Click to set start point, click again to set end point.
                        {distance && (
                            <span style={{ marginLeft: "10px", color: "#2e7d32" }}>
                                Distance: <strong>{distance.toFixed(2)}m</strong>
                            </span>
                        )}
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    width={scaledWidth}
                    height={scaledHeight}
                    style={{
                        border: "2px solid #ccc",
                        backgroundColor: "#f0f0f0",
                        cursor: rulerMode ? "crosshair" : draggingId ? "grabbing" : "pointer",
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
                        <p style={{ fontSize: "12px", color: "#777" }}>ID: {selectedEvidence.id}</p>
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
                            x: {selectedEvidence.pixel.x.toFixed(1)}, y: {selectedEvidence.pixel.y.toFixed(1)}
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
                    <p style={{ color: "#999" }}>{rulerMode ? "Ruler mode active" : "Click a marker to edit or move"}</p>
                )}
            </div>
        </div>
    );
}
