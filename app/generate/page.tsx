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
import { estimateSeconds, formatEstimate } from '@/lib/estimate';

type LastSubmit = { slots: Record<string, string>; isSpecialEd: boolean };
const MAX_AUTO_RETRIES = 4;

function GenerateInner() {
  const params = useSearchParams();
  const raw = Number(params.get('type'));
  const caseTypeId = ([1, 2, 3, 4, 5, 6, 7].includes(raw) ? raw : 1) as CaseTypeId;
  const type = getCaseType(caseTypeId);

  const [ai, setAi] = useState<AiConfig>({ mode: 'free' });
  const [refineMode, setRefineMode] = useState<boolean>(type.highRisk);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lastSubmit = useRef<LastSubmit | null>(null);
  const retryCount = useRef(0);
  const outputRef = useRef<HTMLDivElement>(null);
  const hadOutput = useRef(false);

  // 실제 전송에 쓰일 설정(추론 강도 기본값 해석 포함) — 예상 시간 표시와 요청에 함께 사용한다.
  const effectiveAi: AiConfig = { ...ai, thinkingLevel: ai.thinkingLevel ?? (type.highRisk ? 'dynamic' : 'off') };
  const estLabel = formatEstimate(estimateSeconds(effectiveAi, refineMode));
  // '내 키' 모드에서 모델을 명시적으로 골랐는지 — 이 경우 한도에 걸려도 강등 없이 같은 모델을 기다린다.
  const honorsModel = ai.mode === 'byok' && !!(ai.model && ai.model.trim() !== '');
  const chosenModel = honorsModel ? ai.model!.trim() : null;

  // 출력(결과/오류/대기)이 처음 나타날 때만 스크롤 — 카운트다운 매 초 스크롤 방지.
  useEffect(() => {
    const has = !!(result || error || cooldown != null);
    if (has && !hadOutput.current) outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    hadOutput.current = has;
  }, [result, error, cooldown]);

  // 대기 카운트다운 → 0이 되면 자동으로 다시 시도(요청 한도가 풀릴 시간을 기다림).
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
    if (!isRetry) {
      lastSubmit.current = { slots, isSpecialEd };
      retryCount.current = 0;
      setAttempt(0);
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    setCooldown(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseTypeId, slots, isSpecialEd, ai: effectiveAi, refineMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 429면 자동 재시도 횟수가 남는 한 → 기다렸다 같은 모델로 다시. 강등하지 않는다.
        // (제공자가 대기 시간을 안 알려주면 30초 기본값으로 기다린다.)
        if (res.status === 429 && retryCount.current < MAX_AUTO_RETRIES) {
          retryCount.current += 1;
          setAttempt(retryCount.current);
          setCooldown(Math.min(Math.max(Number(data.retryAfterSec) || 30, 1), 90));
        } else if (res.status === 429) {
          setError(
            honorsModel
              ? `선택하신 ${chosenModel} 모델의 요청 한도가 계속 풀리지 않았습니다. 잠시 뒤 다시 시도하거나, 결제가 설정된 키를 쓰면 원활합니다. (강등 없이 선택한 모델을 유지했습니다.)`
              : '요청 한도가 계속 풀리지 않았습니다. 잠시 뒤 다시 시도하거나, "생성 엔진"에서 gemini-2.5-flash 등 여유 있는 모델로 바꿔 주세요. (pro 계열은 무료 한도가 매우 낮습니다.)'
          );
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

  const tryNow = () => { setCooldown(null); if (lastSubmit.current) void handleSubmit(lastSubmit.current.slots, lastSubmit.current.isSpecialEd, true); };
  const freshRetry = () => { if (lastSubmit.current) void handleSubmit(lastSubmit.current.slots, lastSubmit.current.isSpecialEd, false); };

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

        <ApiKeyPanel onChange={setAi} defaultThinking={type.highRisk ? 'dynamic' : 'off'} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px', fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={refineMode} onChange={(e) => setRefineMode(e.target.checked)} />
          <span>정밀 모드 <span className="muted" style={{ fontWeight: 400 }}>(2단계 생성 · 요청 2배 · 더 느림)</span></span>
        </label>
        <p className="help" style={{ margin: '0 0 18px', lineHeight: 1.55 }}>
          예상 소요 시간 <strong style={{ fontWeight: 600 }}>{estLabel}</strong>
          {refineMode && ' · 정밀 2단계'}
          {honorsModel
            ? ` · 선택하신 ${chosenModel} 모델을 그대로 사용합니다. 한도에 걸리면 강등 없이 잠시 기다렸다 다시 시도합니다.`
            : ' · 대기 시간은 제외한 순수 생성 시간입니다.'}
        </p>
        <SlotForm caseTypeId={caseTypeId} onSubmit={(s, e) => handleSubmit(s, e)} submitting={submitting || cooldown != null} />

        <div ref={outputRef}>
          {submitting && cooldown == null && (
            <div className="callout callout-info" style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="spinner" aria-hidden style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>누가기록을 생성하고 있습니다 · 예상 {estLabel}</div>
                <div style={{ fontSize: 13.5, marginTop: 2 }}>
                  {honorsModel ? `${chosenModel} 모델로 생성 중입니다. ` : ''}잠시만 기다려 주세요.
                </div>
              </div>
            </div>
          )}
          {cooldown != null && (
            <div className="callout callout-warning" style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="spinner" style={{ borderColor: 'rgba(138,97,0,.3)', borderTopColor: 'var(--warning)', flexShrink: 0 }} aria-hidden />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>요청 한도에 걸려 대기 중입니다 <span style={{ fontWeight: 400 }}>(재시도 {attempt}/{MAX_AUTO_RETRIES})</span></div>
                <div style={{ fontSize: 13.5, marginTop: 2 }}>약 <strong>{cooldown}초</strong> 후 {honorsModel ? `${chosenModel} 모델 그대로 ` : ''}자동으로 다시 시도합니다{honorsModel ? ' (강등 없음)' : ''}. 요청은 한 번에 하나씩만 보냅니다.</div>
              </div>
              <button type="button" className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13, flexShrink: 0 }} onClick={tryNow}>지금 시도</button>
            </div>
          )}
          {error && (
            <div className="callout callout-danger" style={{ marginTop: 28 }}>
              <div>{error}</div>
              {lastSubmit.current && (
                <button type="button" className="btn btn-ghost" style={{ marginTop: 14, padding: '8px 14px', fontSize: 13 }} onClick={freshRetry}>다시 시도</button>
              )}
            </div>
          )}
          {result && (
            <div style={{ marginTop: 32 }}>
              {(result.usedModel || result.refined || result.fallbackNote) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 12.5 }}>
                  {result.usedModel && <span className="badge">{result.usedModel}</span>}
                  {result.refined && <span className="badge">정밀 2단계</span>}
                  {result.fallbackNote && <span className="badge badge-risk">{result.fallbackNote}</span>}
                </div>
              )}
              <ResultBlocks result={result} />
            </div>
          )}
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
