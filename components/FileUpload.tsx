"use client";
import { useState } from 'react';
import type { MapData, Evidence } from '../types/types';

interface UploadResponse {
    success: boolean;
    map: MapData;
    evidence: Evidence[];
    baseImage: string;
}

interface FileUploadProps {
    onUploadComplete: (data: UploadResponse) => void;
}

export default function FileUpload({ onUploadComplete }: FileUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setUploading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({ error: 'Upload failed' }));
                setError(j.error || `Upload failed (${res.status})`);
                return;
            }
            const data = (await res.json()) as UploadResponse;
            onUploadComplete(data);
        } catch (err: any) {
            setError(String(err));
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="upload-container">
            <h2>Upload Map Files (admin)</h2>
            <form onSubmit={handleUpload}>
                <div>
                    <label>Map (PGM): </label>
                    <input type="file" name="map" accept=".pgm" required />
                </div>
                <div>
                    <label>Meta (YAML): </label>
                    <input type="file" name="meta" accept=".yaml,.yml" required />
                </div>
                <div>
                    <label>Evidence (CSV): </label>
                    <input type="file" name="evidence" accept=".csv" />
                </div>
                <button type="submit" disabled={uploading}>
                    {uploading ? 'Uploading...' : 'Upload'}
                </button>
            </form>
            {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
    );
}
