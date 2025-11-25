"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function CasesPage() {
  const [cases, setCases] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/cases')
      .then(r => r.json())
      .then(j => { if (j.cases) setCases(j.cases); else setError(j.error || 'Failed'); })
      .catch(e => setError(String(e)));
  }, []);

  return (
    <div>
      <h2>Cases</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul>
        {cases.map(c => (
          <li key={c}><Link href={`/cases/${c}`}>{c}</Link></li>
        ))}
      </ul>
    </div>
  );
}
