"use client";
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { MapData, Evidence } from '../../../types/types';

const MapEditor = dynamic(() => import('../../../components/MapEditor'), { ssr: false });

interface Props {
  caseId: string;
}

export default function CaseViewerClient({ caseId }: Props) {
  const [map, setMap] = useState<MapData | null>(null);
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/cases/${encodeURIComponent(caseId)}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return;
        if (j.error) setError(j.error);
        else {
          setMap(j.map);
          setEvidence(j.evidence || []);
          setBaseImage(j.baseImage);
        }
      })
      .catch(e => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [caseId]);

  if (loading) return <p>Loading case {caseId}…</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!map || !baseImage) return <p>No data</p>;

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidence })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Save failed');
      if (Array.isArray(j.evidence)) {
        setEvidence(j.evidence);
      }
      setSavedMsg('Saved successfully');
    } catch (err: any) {
      setSavedMsg(`Save failed: ${err.message || String(err)}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSavedMsg(null), 4000);
    }
  };

  return (
    <div>
      <h2>Case: {caseId}</h2>
      <div style={{ marginBottom: 12 }}>
        <button onClick={handleSave} disabled={saving} style={{ marginRight: 8 }}>
          {saving ? 'Saving…' : 'Save Markers to S3'}
        </button>
        {savedMsg && <span style={{ color: savedMsg.startsWith('Save failed') ? 'red' : 'green' }}>{savedMsg}</span>}
      </div>
      <MapEditor baseImage={baseImage} mapData={map} evidence={evidence} onEvidenceUpdate={setEvidence} />
    </div>
  );
}
