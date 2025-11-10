import { useState } from 'react';
import axios from 'axios';

interface UploadResponse {
    success: boolean;
    map: { width: number; height: number; contours: any[][] };
    evidence: any[];
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
            const response = await axios.post<UploadResponse>(
                'http://localhost:4000/api/upload',
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } }
            );
            onUploadComplete(response.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="upload-container">
            <h2>Upload Map Files</h2>
            <form onSubmit={handleUpload}>
                <div>
                    <label>Map (PGM): </label>
                    <input type="file" name="map" accept=".pgm" required />
                </div>
                <div>
                    <label>Meta (YAML): </label>
                    <input type="file" name="meta" accept=".yaml" required />
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