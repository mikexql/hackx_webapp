import { useState } from 'react';
import FileUpload from './components/FileUpload';
import MapEditor from './components/MapEditor';
import type { Evidence, MapData } from './types/types';
import './App.css';

function App() {
    const [mapData, setMapData] = useState<MapData | null>(null);
    const [evidence, setEvidence] = useState<Evidence[]>([]);
    const [baseImage, setBaseImage] = useState<string>('');
    const [edgesImage, setEdgesImage] = useState<string>('');
    const [showEdges, setShowEdges] = useState(false);

    const handleUploadComplete = (data: any) => {
        setMapData(data.map);
        setEvidence(data.evidence);
        setBaseImage(data.baseImage);
        
        // Check if LIDAR processing returned edges
        if (data.edgesImage) {
            setEdgesImage(data.edgesImage);
            console.log('LIDAR edge detection available');
        } else {
            setEdgesImage('');
        }
    };

    const handleExport = async () => {
        // Send edited evidence back to server for final processing
        const response = await fetch('http://localhost:4000/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evidence, mapData })
        });
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'annotated_map.png';
        a.click();
    };

    const handleReset = () => {
        setMapData(null);
        setEvidence([]);
        setBaseImage('');
        setEdgesImage('');
        setShowEdges(false);
    };

    return (
        <div className="app">
            <h1>Evidence Map Editor</h1>
            {!mapData ? (
                <FileUpload onUploadComplete={handleUploadComplete} />
            ) : (
                <>
                    {edgesImage && (
                        <div className="view-controls">
                            <label className="toggle-label">
                                <input
                                    type="checkbox"
                                    checked={showEdges}
                                    onChange={(e) => setShowEdges(e.target.checked)}
                                />
                                <span>Show Edge Detection</span>
                            </label>
                        </div>
                    )}
                    
                    <MapEditor
                        baseImage={showEdges && edgesImage ? edgesImage : baseImage}
                        mapData={mapData}
                        evidence={evidence}
                        onEvidenceUpdate={setEvidence}
                    />
                    
                    <div className="button-group">
                        <button onClick={handleExport}>Export Final Map</button>
                        <button onClick={handleReset} className="secondary">Upload New Map</button>
                    </div>
                </>
            )}
        </div>
    );
}

export default App;