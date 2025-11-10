import { useState } from 'react';
import FileUpload from './components/FileUpload';
import MapEditor from './components/MapEditor';
import type { Evidence, MapData } from './types/types';
import './App.css';

function App() {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [baseImage, setBaseImage] = useState<string>('');

  const handleUploadComplete = (data: any) => {
    setMapData(data.map);
    setEvidence(data.evidence);
    setBaseImage(data.baseImage);
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

  return (
    <div className="app">
      <h1>Evidence Map Editor</h1>
      {!mapData ? (
        <FileUpload onUploadComplete={handleUploadComplete} />
      ) : (
        <>
          <MapEditor
            baseImage={baseImage}
            mapData={mapData}
            evidence={evidence}
            onEvidenceUpdate={setEvidence}
          />
          <button onClick={handleExport}>Export Final Map</button>
        </>
      )}
    </div>
  );
}

export default App;