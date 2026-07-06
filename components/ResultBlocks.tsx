'use client';
import { useState } from 'react';
import type { GenerateResult } from '@/lib/types';

function neisText(r: GenerateResult): string {
  return [
    '[NEIS 누가기록 — 복사·붙여넣기용 / 평어 종결]',
    '',
    r.body,
    '',
    `[근거] ${r.meta.bases}`,
    `[유형] ${r.meta.caseType}`,
    `[글자수] ${r.meta.charCount}`,
    `[지도 단계] ${r.meta.guidanceStep}`,
    `[보호자 통보] ${r.meta.guardianNotice}`,
    `[후속] ${r.meta.followUp}`,
  ].join('\n');
}

function Block({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div style={{ fontSize: 12, color: 'var(--color-smoke)', marginBottom: 12 }}>{title} · NEIS에 붙여넣지 말 것</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--color-steel)', fontSize: 16, lineHeight: 1.5 }}>
        {items.map((it, i) => <li key={i} style={{ marginBottom: 8 }}>{it}</li>)}
      </ul>
    </div>
  );
}

export default function ResultBlocks({ result }: { result: GenerateResult }) {
  const [copied, setCopied] = useState(false);
  const text = neisText(result);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; user can select manually */
    }
  }

  return (
    <div>
      {result.warnings.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--color-lavender-border)', background: 'var(--color-periwinkle-wash)', marginBottom: 24 }}>
          {result.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 14, color: 'var(--color-midnight-ink)' }}>{w}</div>
          ))}
        </div>
      )}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--color-smoke)' }}>NEIS 복사·붙여넣기용</div>
          <button className="btn btn-ghost" type="button" onClick={copy}>{copied ? '복사됨' : '본문+메타 복사'}</button>
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 16, lineHeight: 1.6, margin: 0 }}>{text}</pre>
      </div>
      <Block title="교사 이해용 — 법령·판례 풀이" items={result.teacherUnderstanding} />
      <Block title="향후 안전한 지도 방법 — 교사용" items={result.safeGuidance} />
      <Block title="교사 보관 메모" items={result.teacherMemo} />
    </div>
  );
}
