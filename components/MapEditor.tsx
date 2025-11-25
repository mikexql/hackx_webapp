"use client";

import { useEffect, useRef, useState } from "react";
import type { Evidence, MapData } from "../types/types";

export interface MapEditorProps {
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
    // Keep marker IDs incremental so they round-trip cleanly with CSV rows
    const getNextMarkerId = () => {
        let maxId = 0;
        for (const ev of evidence) {
            const numeric = Number(ev.id);
            if (!Number.isNaN(numeric)) {
                maxId = Math.max(maxId, numeric);
            }
        }
        return String(maxId + 1);
    };

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [scale, setScale] = useState(1);
    const [hasManualZoom, setHasManualZoom] = useState(false);
    const [imageLoaded, setImageLoaded] = useState<HTMLImageElement | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const panStateRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

    // Ruler state
    const [rulerMode, setRulerMode] = useState(false);
    const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
    const [rulerEnd, setRulerEnd] = useState<{ x: number; y: number } | null>(null);
    const [distance, setDistance] = useState<number | null>(null);

    // Canvas should have fixed size based on mapData, zoom is handled via CSS transform
    const canvasWidth = mapData.width;
    const canvasHeight = mapData.height;
    const selectedEvidence = evidence.find((e) => e.id === selectedId);

    useEffect(() => {
        const img = new Image();
        img.src = baseImage;
        img.onload = () => setImageLoaded(img);
    }, [baseImage]);

    useEffect(() => {
        setHasManualZoom(false);
    }, [canvasWidth, canvasHeight]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || typeof ResizeObserver === "undefined") return;

        const updateScaleToFit = () => {
            if (!containerRef.current) return;
            const widthScale = containerRef.current.clientWidth / canvasWidth;
            const clamped = Number(Math.max(0.25, Math.min(4, widthScale || 1)).toFixed(2));
            if (!hasManualZoom) {
                setScale(clamped);
            }
        };

        updateScaleToFit();
        const observer = new ResizeObserver(updateScaleToFit);
        observer.observe(container);

        return () => observer.disconnect();
    }, [canvasWidth, hasManualZoom]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imageLoaded) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Clear and draw at base resolution
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(imageLoaded, 0, 0, canvasWidth, canvasHeight);

        ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
        ctx.lineWidth = 1;
        for (const contour of mapData.contours) {
            ctx.beginPath();
            contour.forEach((p, i) => {
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.stroke();
        }

        // Draw markers at base size
        for (const ev of evidence) {
            const x = ev.pixel.x;
            const y = ev.pixel.y;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = selectedId === ev.id ? "#ffeb3b" : "#f44336";
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();
        }

        if (rulerStart) {
            const startX = rulerStart.x;
            const startY = rulerStart.y;
            ctx.beginPath();
            ctx.arc(startX, startY, 6, 0, 2 * Math.PI);
            ctx.fillStyle = "#4CAF50";
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.stroke();

            if (rulerEnd) {
                const endX = rulerEnd.x;
                const endY = rulerEnd.y;
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.strokeStyle = "#4CAF50";
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.beginPath();
                ctx.arc(endX, endY, 6, 0, 2 * Math.PI);
                ctx.fillStyle = "#4CAF50";
                ctx.fill();
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2;
                ctx.stroke();

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
    }, [evidence, imageLoaded, selectedId, mapData, rulerMode, rulerStart, rulerEnd, distance, canvasWidth, canvasHeight]);

    const getMarkerAt = (canvasX: number, canvasY: number) => {
        const r = 8;
        return evidence.find((ev) => Math.hypot(canvasX - ev.pixel.x, canvasY - ev.pixel.y) <= r);
    };

    const getCanvasCoordinates = (clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        // Canvas is scaled by CSS transform, so rect dimensions are scaled
        // We need to convert back to canvas coordinates
        const x = (clientX - rect.left) / scale;
        const y = (clientY - rect.top) / scale;
        return { x, y };
    };

    const beginPan = (clientX: number, clientY: number) => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        panStateRef.current = {
            startX: clientX,
            startY: clientY,
            scrollLeft: container.scrollLeft,
            scrollTop: container.scrollTop,
        };
        setIsPanning(true);
    };

    useEffect(() => {
        if (!isPanning) return;

        const handleMouseMove = (event: MouseEvent) => {
            if (!panStateRef.current || !containerRef.current) return;
            event.preventDefault();
            const { startX, startY, scrollLeft, scrollTop } = panStateRef.current;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            containerRef.current.scrollLeft = scrollLeft - dx;
            containerRef.current.scrollTop = scrollTop - dy;
        };

        const endPan = () => {
            setIsPanning(false);
            panStateRef.current = null;
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", endPan);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", endPan);
        };
    }, [isPanning]);

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) return;
        if (!canvasRef.current) return;
        const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);

        if (rulerMode) {
            if (!rulerStart) {
                setRulerStart({ x, y });
                setRulerEnd(null);
                setDistance(null);
            } else if (!rulerEnd) {
                setRulerEnd({ x, y });
                const dx = (x - rulerStart.x) * resolution;
                const dy = (y - rulerStart.y) * resolution;
                setDistance(Math.sqrt(dx * dx + dy * dy));
            } else {
                setRulerStart({ x, y });
                setRulerEnd(null);
                setDistance(null);
            }
        } else {
            const hit = getMarkerAt(x, y);
            if (hit) {
                setSelectedId(hit.id);
                setDraggingId(hit.id);
            } else {
                setSelectedId(null);
                beginPan(e.clientX, e.clientY);
            }
        }
        e.preventDefault();
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isPanning || !draggingId || !canvasRef.current || rulerMode) return;
        const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);

        const updated = evidence.map((ev) =>
            ev.id === draggingId ? { ...ev, pixel: { x, y } } : ev
        );
        onEvidenceUpdate(updated);
    };

    const handleMouseUp = () => {
        setDraggingId(null);
        if (isPanning) {
            setIsPanning(false);
            panStateRef.current = null;
        }
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;
        const touch = e.touches[0];
        if (!touch) return;
        const { x, y } = getCanvasCoordinates(touch.clientX, touch.clientY);

        if (rulerMode) {
            if (!rulerStart) {
                setRulerStart({ x, y });
                setRulerEnd(null);
                setDistance(null);
            } else if (!rulerEnd) {
                setRulerEnd({ x, y });
                const dx = (x - rulerStart.x) * resolution;
                const dy = (y - rulerStart.y) * resolution;
                setDistance(Math.sqrt(dx * dx + dy * dy));
            } else {
                setRulerStart({ x, y });
                setRulerEnd(null);
                setDistance(null);
            }
        } else {
            const hit = getMarkerAt(x, y);
            if (hit) {
                setSelectedId(hit.id);
                setDraggingId(hit.id);
            } else {
                setSelectedId(null);
            }
        }
        e.preventDefault();
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (!draggingId || !canvasRef.current || rulerMode) return;
        const touch = e.touches[0];
        if (!touch) return;
        const { x, y } = getCanvasCoordinates(touch.clientX, touch.clientY);

        const updated = evidence.map((ev) =>
            ev.id === draggingId ? { ...ev, pixel: { x, y } } : ev
        );
        onEvidenceUpdate(updated);
        e.preventDefault();
    };

    const handleTouchEnd = () => {
        setDraggingId(null);
    };

    const toggleRulerMode = () => {
        setRulerMode(!rulerMode);
        setRulerStart(null);
        setRulerEnd(null);
        setDistance(null);
        setSelectedId(null);
    };

    const handleAddMarker = () => {
        const newEvidence: Evidence = {
            id: getNextMarkerId(),
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
            onEvidenceUpdate(evidence.filter((ev) => ev.id !== selectedId));
            setSelectedId(null);
        }
    };

    const updateField = (field: keyof Evidence, value: string) => {
        if (!selectedId) return;
        const updated = evidence.map((ev) => (ev.id === selectedId ? { ...ev, [field]: value } : ev));
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
        <div className="flex flex-col gap-4 sm:gap-6 xl:flex-row xl:p-0">
            <div className="flex-1 space-y-3 sm:space-y-4 min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl sm:rounded-2xl border border-border/30 bg-secondary/20 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground hidden sm:inline">Zoom</span>
                        <input
                            type="range"
                            min="0.25"
                            max="4"
                            step="0.25"
                            value={scale}
                            onChange={(e) => {
                                setScale(Number(e.target.value));
                                setHasManualZoom(true);
                            }}
                            className="h-2 w-24 sm:w-32 accent-primary"
                        />
                        <span className="font-semibold text-primary text-xs sm:text-sm">{scale.toFixed(2)}x</span>
                    </div>
                    <button
                        onClick={toggleRulerMode}
                        type="button"
                        className={`inline-flex items-center gap-1 sm:gap-2 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold transition ${
                            rulerMode
                                ? "bg-emerald-500/90 text-emerald-950 shadow-[0_10px_25px_rgba(16,185,129,0.35)]"
                                : "border border-border/40 bg-secondary/40 text-foreground"
                        }`}
                    >
                        <span className="hidden sm:inline">📏</span> Ruler {rulerMode ? "On" : ""}
                    </button>
                    <button
                        onClick={handleAddMarker}
                        type="button"
                        disabled={rulerMode}
                        className="inline-flex items-center rounded-full bg-sky-500 px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-950 shadow-[0_12px_30px_rgba(14,165,233,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        + Add Marker
                    </button>
                    <button
                        onClick={handleExport}
                        type="button"
                        className="inline-flex items-center rounded-full bg-blue-500/90 px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-950 shadow-[0_12px_30px_rgba(59,130,246,0.35)]"
                    >
                        <span className="hidden sm:inline">Download Map</span>
                        <span className="sm:hidden">Download</span>
                    </button>
                    <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                        Markers: <span className="font-semibold text-primary">{evidence.length}</span>
                    </span>
                </div>

                {rulerMode && (
                    <div className="rounded-xl sm:rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-emerald-100">
                        <strong className="text-emerald-300">Ruler mode:</strong> Click to set start point, then end point.
                        {distance && (
                            <span className="block sm:inline sm:ml-3 mt-1 sm:mt-0 text-emerald-200">
                                Distance <strong>{distance.toFixed(2)}m</strong>
                            </span>
                        )}
                    </div>
                )}

                <div 
                    ref={containerRef}
                    className={`overflow-auto rounded-xl sm:rounded-[28px] border border-border/40 bg-neutral-900/60 p-2 sm:p-4 ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
                >
                    <div 
                        className="inline-block relative"
                        style={{ 
                            width: `${canvasWidth * scale}px`,
                            height: `${canvasHeight * scale}px`
                        }}
                    >
                        <canvas
                            ref={canvasRef}
                            width={canvasWidth}
                            height={canvasHeight}
                            className="block rounded-lg sm:rounded-[24px] border-2 border-slate-800 bg-slate-900/80 shadow-inner absolute top-0 left-0"
                            style={{ 
                                cursor: rulerMode ? "crosshair" : draggingId ? "grabbing" : "pointer",
                                transform: `scale(${scale})`,
                                transformOrigin: 'top left',
                                width: `${canvasWidth}px`,
                                height: `${canvasHeight}px`
                            }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                        />
                    </div>
                </div>
            </div>

            <div className="w-full rounded-2xl sm:rounded-3xl border border-border/40 bg-[#05090f] p-4 sm:p-5 text-xs sm:text-sm shadow-[0_20px_60px_rgba(0,0,0,0.55)] xl:w-[320px] xl:flex-shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
                    <h3 className="text-base sm:text-lg font-semibold text-foreground">Marker Editor</h3>
                    <span className="text-xs text-muted-foreground">Click a marker to edit</span>
                </div>
                <div className="mt-4 space-y-3 sm:space-y-4">
                    {selectedEvidence ? (
                        <>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">ID: {selectedEvidence.id}</p>
                            <label className="block space-y-1 text-muted-foreground">
                                <span className="text-xs sm:text-sm">Label</span>
                                <input
                                    value={selectedEvidence.label}
                                    onChange={(e) => updateField("label", e.target.value)}
                                    className="w-full rounded-lg sm:rounded-xl border border-border/40 bg-secondary/20 px-3 py-2 text-sm sm:text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </label>
                            <label className="block space-y-1 text-muted-foreground">
                                <span className="text-xs sm:text-sm">Category</span>
                                <input
                                    value={selectedEvidence.category}
                                    onChange={(e) => updateField("category", e.target.value)}
                                    className="w-full rounded-lg sm:rounded-xl border border-border/40 bg-secondary/20 px-3 py-2 text-sm sm:text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </label>
                            <label className="block space-y-1 text-muted-foreground">
                                <span className="text-xs sm:text-sm">Notes</span>
                                <textarea
                                    value={selectedEvidence.notes}
                                    onChange={(e) => updateField("notes", e.target.value)}
                                    rows={4}
                                    className="w-full rounded-lg sm:rounded-xl border border-border/40 bg-secondary/20 px-3 py-2 text-sm sm:text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
                                />
                            </label>
                            <p className="text-xs text-muted-foreground">
                                x: {selectedEvidence.pixel.x.toFixed(1)}, y: {selectedEvidence.pixel.y.toFixed(1)}
                            </p>
                            <button
                                onClick={handleDelete}
                                type="button"
                                className="w-full rounded-xl sm:rounded-2xl bg-red-500/90 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-[0_15px_30px_rgba(239,68,68,0.35)] transition hover:bg-red-500"
                            >
                                Delete Marker
                            </button>
                        </>
                    ) : (
                        <div className="rounded-xl sm:rounded-2xl border border-dashed border-border/40 bg-secondary/10 px-3 py-6 text-center text-xs sm:text-sm text-muted-foreground">
                            {rulerMode ? "Ruler mode active — exit to edit markers." : "Select or drag a marker to edit its details."}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
