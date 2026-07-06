'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { AiConfig, CaseTypeId, GenerateResult } from '@/lib/types';
import { getCaseType } from '@/lib/caseTypes';
import SiteHeader from '@/components/SiteHeader';
import ApiKeyPanel from '@/components/ApiKeyPanel';
import SlotForm from '@/components/SlotForm';
import ResultBlocks from '@/components/ResultBlocks';
import { addHistory, makeId } from '@/lib/history';

type LastSubmit = { slots: Record<string, string>; isSpecialEd: boolean };

function GenerateInner() {
  const params = useSearchParams();
  const raw = Number(params.get('type'));
  const caseTypeId = ([1, 2, 3, 4, 5, 6, 7].includes(raw) ? raw : 1) as CaseTypeId;
  const type = getCaseType(caseTypeId);

  const [ai, setAi] = useState<AiConfig>({ mode: 'free' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number | null>(null);
  const lastSubmit = useRef<LastSubmit | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const hadOutput = useRef(false);

  // 출력(결과/오류/대기)이 처음 나타날 때만 스크롤 — 카운트다운 매 초 스크롤 방지.
  useEffect(() => {
    const has = !!(result || error || cooldown != null);
    if (has && !hadOutput.current) outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    hadOutput.current = has;
  }, [result, error, cooldown]);

  // 대기 카운트다운 → 0이 되면 자동으로 1회 재시도.
  useEffect(() => {
    if (cooldown == null) return;
    if (cooldown <= 0) {
      setCooldown(null);
      if (lastSubmit.current) void handleSubmit(lastSubmit.current.slots, lastSubmit.current.isSpecialEd, true);
      return;
    }
    const t = setTimeout(() => setCooldown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooldown]);

  async function handleSubmit(slots: Record<string, string>, isSpecialEd: boolean, isRetry = false) {
    if (!isRetry) lastSubmit.current = { slots, isSpecialEd };
    setSubmitting(true);
    setError(null);
    setResult(null);
    setCooldown(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseTypeId, slots, isSpecialEd, ai }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 429 + 서버가 대기 시간을 알려줬고 아직 자동재시도 전이면 → 카운트다운.
        if (res.status === 429 && data.retryAfterSec && !isRetry) {
          setCooldown(Math.min(Math.max(Number(data.retryAfterSec) || 30, 1), 90));
        } else {
          setError(data.error ?? '생성에 실패했습니다.');
        }
      } else {
        setResult(data as GenerateResult);
        addHistory({ id: makeId(JSON.stringify(slots) + type.id), date: new Date().toISOString().slice(0, 10), caseTypeId, result: data });
      }
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  const retryNow = () => { if (lastSubmit.current) void handleSubmit(lastSubmit.current.slots, lastSubmit.current.isSpecialEd, true); };

  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 40, paddingBottom: 88, maxWidth: 720 }}>
        <Link href="/" style={{ fontSize: 14, color: 'var(--ink-muted)', fontWeight: 500 }}>← 유형 다시 선택</Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 'var(--text-heading)' }}>{type.name}</h1>
          {type.highRisk && <span className="badge badge-risk">고위험</span>}
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 15, marginTop: 10, lineHeight: 1.6 }}>
          권장 분량 {type.lengthHint}
          {type.highRisk && ' · 제출하면 현행 법령을 실시간으로 대조합니다.'}
        </p>

        <hr className="hairline" style={{ margin: '28px 0' }} />

        <ApiKeyPanel onChange={setAi} />
        <SlotForm caseTypeId={caseTypeId} onSubmit={(s, e) => handleSubmit(s, e)} submitting={submitting || cooldown != null} />

        <div ref={outputRef}>
          {cooldown != null && (
            <div className="callout callout-warning" style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="spinner" style={{ borderColor: 'rgba(138,97,0,.3)', borderTopColor: 'var(--warning)', flexShrink: 0 }} aria-hidden />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>요청 한도에 걸려 대기 중입니다</div>
                <div style={{ fontSize: 13.5, marginTop: 2 }}>약 <strong>{cooldown}초</strong> 후 자동으로 다시 시도합니다. (무료 등급은 분당 약 20회 제한)</div>
              </div>
              <button type="button" className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13, flexShrink: 0 }} onClick={() => { setCooldown(null); retryNow(); }}>
                지금 시도
              </button>
            </div>
          )}
          {error && (
            <div className="callout callout-danger" style={{ marginTop: 28 }}>
              <div>{error}</div>
              {lastSubmit.current && (
                <button type="button" className="btn btn-ghost" style={{ marginTop: 14, padding: '8px 14px', fontSize: 13 }} onClick={retryNow}>
                  다시 시도
                </button>
              )}
            </div>
          )}
          {result && <div style={{ marginTop: 32 }}><ResultBlocks result={result} /></div>}
        </div>
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
