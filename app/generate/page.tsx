'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { AiConfig, CaseTypeId, GenerateResult } from '@/lib/types';
import { getCaseType } from '@/lib/caseTypes';
import SiteHeader from '@/components/SiteHeader';
import ApiKeyPanel from '@/components/ApiKeyPanel';
import SlotForm from '@/components/SlotForm';
import ResultBlocks from '@/components/ResultBlocks';
import { addHistory, makeId } from '@/lib/history';

function GenerateInner() {
  const params = useSearchParams();
  const raw = Number(params.get('type'));
  const caseTypeId = ([1, 2, 3, 4, 5, 6, 7].includes(raw) ? raw : 1) as CaseTypeId;
  const type = getCaseType(caseTypeId);

  const [ai, setAi] = useState<AiConfig>({ mode: 'free' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(slots: Record<string, string>, isSpecialEd: boolean) {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseTypeId, slots, isSpecialEd, ai }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '생성에 실패했습니다.');
      } else {
        setResult(data as GenerateResult);
        addHistory({ id: makeId(JSON.stringify(slots) + type.id), date: new Date().toISOString().slice(0, 10), caseTypeId, result: data });
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 48, paddingBottom: 96, maxWidth: 760 }}>
        <Link href="/" style={{ fontSize: 14 }}>← 유형 다시 선택</Link>
        <h1 style={{ fontSize: 'var(--text-heading)', letterSpacing: '-0.64px', marginTop: 16 }}>{type.name}</h1>
        <p style={{ color: 'var(--color-slate)', fontSize: 16, marginTop: 8 }}>권장 분량 {type.lengthHint}</p>
        <hr className="hairline" style={{ margin: '32px 0' }} />
        <ApiKeyPanel onChange={setAi} />
        <SlotForm caseTypeId={caseTypeId} onSubmit={handleSubmit} submitting={submitting} />
        {error && (
          <div className="card" style={{ marginTop: 24, borderColor: 'var(--color-lavender-border)' }}>
            <div style={{ color: 'var(--color-indigo-ink)', fontSize: 14 }}>{error}</div>
          </div>
        )}
        {result && <div style={{ marginTop: 32 }}><ResultBlocks result={result} /></div>}
      </main>
    </>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<main className="container" style={{ paddingTop: 64 }}>불러오는 중…</main>}>
      <GenerateInner />
    </Suspense>
  );
}
