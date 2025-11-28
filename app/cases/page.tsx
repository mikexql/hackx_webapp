"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Clock, MapPin, Search, User, PlusCircle, BadgeInfo } from 'lucide-react';
import type { CaseSummary } from '@/types/case';
import StatusBadge from '@/components/StatusBadge';


export default function CasesPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const link = process.env.NEXT_PUBLIC_FOXGLOVE_LINK || "https://app.foxglove.dev/mike-e5803f88/p/prj_0e2hWBUlkSO7nouN/view?layoutId=lay_0e2hdR3Y0F0nyBCc&ds=foxglove-websocket&ds.url=wss%3A%2F%2Fbraeden-postlike-emiko.ngrok-free.dev";


  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/cases')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (Array.isArray(json.cases)) {
          setCases(json.cases);
          setError(null);
        } else {
          setError(json.error || 'Failed to load cases');
        }
      })
      .catch((err) => !cancelled && setError(String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCases = useMemo(() => {
    if (!search.trim()) return cases;
    const lower = search.toLowerCase();
    return cases.filter((item) =>
      item.title.toLowerCase().includes(lower) ||
      item.description.toLowerCase().includes(lower) ||
      item.tags.some((tag) => tag.toLowerCase().includes(lower))
    );
  }, [cases, search]);

  const totalMarkers = useMemo(() => cases.reduce((sum, c) => sum + c.evidenceCount, 0), [cases]);
  const openCases = useMemo(() => cases.filter((c) => c.status === 'open').length, [cases]);

  return (
    <div className="min-h-screen bg-transparent">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">Case Management</h1>
              <p className="text-sm sm:text-base text-muted-foreground">View and manage all active cases</p>
            </div>
            <Link
              href={link}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:bg-primary/90 mt-4 sm:mt-0 sm:ml-4 flex-shrink-0"
            >
              Visualize Cases
            </Link>
          </div>

          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1 w-full">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search cases, tags, or descriptions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-full border border-border bg-secondary/40 px-12 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center text-sm text-muted-foreground lg:flex-1 lg:max-w-md">
              <div className="rounded-xl border border-border/40 bg-card/40 px-2 sm:px-4 py-2 sm:py-3">
                <p className="text-xs uppercase">Total Cases</p>
                <p className="text-xl sm:text-2xl font-semibold text-foreground">{cases.length}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/40 px-2 sm:px-4 py-2 sm:py-3">
                <p className="text-xs uppercase">Open</p>
                <p className="text-xl sm:text-2xl font-semibold text-foreground">{openCases}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
        {error && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm sm:text-base text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-48 animate-pulse rounded-2xl border border-border/40 bg-card/40" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCases.map((caseItem) => (
                <Link
                  key={caseItem.id}
                  href={`/cases/${caseItem.id}`}
                  className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-b from-[#0b1120] via-[#0d1528] to-[#090f1a] p-5 shadow-xl shadow-black/40 transition hover:-translate-y-1 hover:border-primary/60 hover:shadow-primary/20"
                >
                  <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.15),transparent_55%)]" />
                  <div className="relative flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0 flex-1">
                        <BadgeInfo className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate text-xs">{caseItem.id}</span>
                      </div>
                      <StatusBadge status={caseItem.status} />
                    </div>

                    <h2 className="text-lg font-semibold text-foreground group-hover:text-primary line-clamp-2 mb-2">
                      {caseItem.title}
                    </h2>

                    <p className="text-sm text-muted-foreground/90 line-clamp-2 mb-4 flex-shrink-0">
                      {caseItem.description}
                    </p>

                    {caseItem.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {caseItem.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary shadow-[0_8px_20px_rgba(56,189,248,0.15)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto pt-4 border-t border-border/30 space-y-2 text-muted-foreground/80">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{formatDistanceToNow(new Date(caseItem.updatedAt), { addSuffix: true })}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>{caseItem.evidenceCount}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{caseItem.createdBy && caseItem.createdBy.trim().length ? caseItem.createdBy.trim() : '-'}</span>
                      </div>
                    </div>
                    </div>
                </Link>
              ))}
            </div>

            {!filteredCases.length && !loading && (
              <div className="mt-10 rounded-2xl border border-border/50 bg-card/30 px-4 sm:px-8 py-8 sm:py-10 text-center text-sm sm:text-base text-muted-foreground">
                <p>No cases found for "{search}"</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
