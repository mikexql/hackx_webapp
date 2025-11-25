"use client";

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { MapData, Evidence } from '@/types/types';
import type { CaseSummary, CaseStatus, CaseMetadata } from '@/types/case';
import StatusBadge from '@/components/StatusBadge';
import type { MapEditorProps } from '@components/MapEditor';

const MapEditor = dynamic<MapEditorProps>(() => import('@components/MapEditor'), { ssr: false });

interface Props {
  caseId: string;
}

type CaseResponse = {
  map: MapData;
  evidence: Evidence[];
  baseImage: string;
  summary?: CaseSummary;
  error?: string;
};

type SaveResponse = {
  success?: boolean;
  key?: string;
  evidence?: Evidence[];
  metadata?: CaseMetadata | null;
  error?: string;
};

const STATUS_OPTIONS: Array<{ value: CaseStatus; label: string; active: string; idle: string }> = [
  {
    value: 'open',
    label: 'Open',
    active: 'border-emerald-400 bg-emerald-500/25 text-emerald-50 shadow-[0_8px_25px_rgba(16,185,129,0.25)]',
    idle: 'text-emerald-200/70'
  },
  {
    value: 'in-progress',
    label: 'In Progress',
    active: 'border-amber-400 bg-amber-400/20 text-amber-50 shadow-[0_8px_25px_rgba(245,158,11,0.25)]',
    idle: 'text-amber-100/70'
  },
  {
    value: 'closed',
    label: 'Closed',
    active: 'border-sky-400 bg-sky-400/20 text-sky-50 shadow-[0_8px_25px_rgba(14,165,233,0.25)]',
    idle: 'text-sky-100/70'
  },
  {
    value: 'archived',
    label: 'Archived',
    active: 'border-slate-400 bg-slate-400/20 text-slate-50 shadow-[0_8px_25px_rgba(148,163,184,0.3)]',
    idle: 'text-slate-200/70'
  }
];

export default function CaseViewerClient({ caseId }: Props) {
  const [map, setMap] = useState<MapData | null>(null);
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [summary, setSummary] = useState<CaseSummary | null>(null);
  const [details, setDetails] = useState<CaseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/cases/${encodeURIComponent(caseId)}`)
      .then((response) => response.json())
      .then((json: CaseResponse) => {
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
          return;
        }
        setMap(json.map);
        setBaseImage(json.baseImage);
        setEvidence(json.evidence ?? []);
        const fallbackSummary: CaseSummary = json.summary ?? {
          id: caseId,
          title: caseId,
          description: '-',
          status: 'open',
          createdBy: '-',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          evidenceCount: json.evidence?.length ?? 0,
          tags: [],
          files: {}
        };
        setSummary(fallbackSummary);
        setDetails(fallbackSummary);
      })
      .catch((err) => !cancelled && setError(String(err)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const status: CaseStatus = details?.status ?? 'open';

  const formattedDates = useMemo(() => {
    const created = details?.createdAt ? new Date(details.createdAt).toLocaleString() : '—';
    const updated = details?.updatedAt ? new Date(details.updatedAt).toLocaleString() : '—';
    return { created, updated };
  }, [details]);

  const updateDetails = (partial: Partial<CaseSummary>) => {
    setDetails((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const metadataPayload = details
        ? {
            title: details.title?.trim() || details.title,
            description: details.description?.trim() || details.description,
            status: details.status,
            createdBy: details.createdBy?.trim() || details.createdBy,
            tags: details.tags ?? [],
          }
        : undefined;
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidence, metadata: metadataPayload })
      });
      const json: SaveResponse = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      if (Array.isArray(json.evidence)) {
        setEvidence(json.evidence);
      }
      if (json.metadata) {
        setDetails((prev) => (prev ? { ...prev, ...json.metadata } : prev));
        setSummary((prev) => (prev ? { ...prev, ...json.metadata } : prev));
      }
      toast.success('Successfully saved changes');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save evidence');
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return <div className="p-10 text-destructive">{error}</div>;
  }

  const mapReady = Boolean(map && baseImage);

  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:px-6 py-4 sm:py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 items-start gap-3 sm:gap-4 min-w-0">
            <Link
              href="/cases"
              className="inline-flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl border border-border/60 text-muted-foreground transition hover:border-primary/60 hover:text-primary flex-shrink-0"
              aria-label="Back to cases"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Case #{caseId}</p>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-foreground truncate">{details?.title ?? summary?.title ?? caseId}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground/90">
                <span>Created {formattedDates.created}</span>
                <span className="hidden sm:inline text-muted-foreground/60">•</span>
                <span>Updated {formattedDates.updated}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <StatusBadge status={status} />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-400 to-blue-500 px-4 sm:px-6 py-2 text-xs sm:text-sm font-semibold text-slate-950 shadow-[0_10px_30px_rgba(14,165,233,0.35)] transition hover:shadow-[0_15px_35px_rgba(14,165,233,0.45)] disabled:opacity-60 flex-shrink-0"
            >
              <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">{saving ? 'Saving…' : 'Save All Changes'}</span>
              <span className="sm:hidden">{saving ? 'Saving…' : 'Save'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-4 sm:space-y-6 px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
        <section className="rounded-2xl sm:rounded-[32px] border border-border/40 bg-card/40 p-3 sm:p-4 lg:p-6 shadow-[0_25px_80px_rgba(0,0,0,0.35)] min-h-[420px]">
          {mapReady && baseImage && map ? (
            <MapEditor baseImage={baseImage} mapData={map} evidence={evidence} onEvidenceUpdate={setEvidence} />
          ) : (
            <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-border/50 bg-secondary/10 text-sm text-muted-foreground">
              {loading ? 'Loading case map…' : 'No map data for this case.'}
            </div>
          )}
        </section>

        <section className="rounded-2xl sm:rounded-[32px] border border-border/40 bg-card/50 p-4 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base sm:text-lg font-semibold">Case Details & Settings</h2>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <label className="block space-y-1">
                <span className="text-muted-foreground text-xs sm:text-sm">Case Title</span>
                <input
                  type="text"
                  value={details?.title ?? ''}
                  onChange={(e) => updateDetails({ title: e.target.value })}
                  className="w-full rounded-xl sm:rounded-2xl border border-border/40 bg-secondary/20 px-3 sm:px-4 py-2 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-muted-foreground text-xs sm:text-sm">Created By</span>
                <input
                  type="text"
                  value={details?.createdBy ?? ''}
                  onChange={(e) => updateDetails({ createdBy: e.target.value })}
                  className="w-full rounded-xl sm:rounded-2xl border border-border/40 bg-secondary/20 px-3 sm:px-4 py-2 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-muted-foreground text-xs sm:text-sm">Description</span>
                <textarea
                  value={details?.description ?? ''}
                  onChange={(e) => updateDetails({ description: e.target.value })}
                  className="w-full rounded-xl sm:rounded-2xl border border-border/40 bg-secondary/20 px-3 sm:px-4 py-2 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
                  rows={4}
                />
              </label>
            </div>
            <div className="space-y-5">
              <div className="space-y-2">
                <span className="text-muted-foreground text-xs sm:text-sm">Status</span>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_OPTIONS.map((option) => {
                    const isActive = status === option.value;
                    return (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => updateDetails({ status: option.value })}
                        className={`rounded-xl sm:rounded-2xl border px-2 sm:px-3 py-2 text-xs sm:text-sm font-semibold transition ${
                          isActive ? option.active : `border-border/40 bg-transparent ${option.idle}`
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="block space-y-2">
                <span className="text-muted-foreground text-xs sm:text-sm">Tags (comma separated)</span>
                <input
                  type="text"
                  value={(details?.tags ?? []).join(', ')}
                  onChange={(e) =>
                    updateDetails({
                      tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean)
                    })
                  }
                  className="w-full rounded-xl sm:rounded-2xl border border-border/40 bg-secondary/20 px-3 sm:px-4 py-2 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>

            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
