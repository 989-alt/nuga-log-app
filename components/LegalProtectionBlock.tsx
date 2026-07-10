'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { CaseTypeId, LegalProtection, SpecialEdInfo } from '@/lib/types';
import type { Precedent } from '@/lib/lawRetrieval';

export interface LegalProtectionContext {
  caseTypeId: CaseTypeId;
  slots: Record<string, string>;
  specialEd: SpecialEdInfo;
}

export default function LegalProtectionBlock({
  items,
  context,
}: {
  items: LegalProtection[];
  context?: LegalProtectionContext;
}) {
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [extra, setExtra] = useState<Precedent[]>([]);

  if (items.length === 0) return null;

  async function findMore() {
    if (!context || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/precedents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context),
      });
      if (!res.ok) {
        setExtra([]);
      } else {
        const data = await res.json();
        setExtra(Array.isArray(data?.precedents) ? data.precedents : []);
      }
    } catch {
      setExtra([]);
    } finally {
      setSearched(true);
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Image src="/glass/icon-scale.png" alt="" width={36} height={36} style={{ borderRadius: 10, flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>법적 보호 분석 — 교사용</span>
        </span>
        <span className="badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>NEIS에 붙여넣지 말 것</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 12 }}>
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.7, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
            <strong style={{ color: 'var(--ink)' }}>{it.element}</strong>
            {it.support && <>: {it.support}</>}
            {it.caseRefs.length > 0 && (
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, marginLeft: 8 }}>
                {it.caseRefs.map((ref, j) => (
                  <span key={j} className="badge badge-normal" style={{ fontSize: 12 }}>{ref}</span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>

      {context && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '9px 16px', fontSize: 13.5 }}
            onClick={findMore}
            disabled={loading}
          >
            <Image src="/glass/icon-doc-search.png" alt="" width={24} height={24} style={{ borderRadius: 7, flexShrink: 0 }} />
            {loading ? '판례 검색 중…' : '판례 더 찾기'}
          </button>

          {searched && !loading && extra.length === 0 && (
            <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', marginTop: 10 }}>
              추가 판례를 찾지 못했습니다.
            </p>
          )}

          {extra.length > 0 && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 20, display: 'grid', gap: 10 }}>
              {extra.map((p, i) => (
                <li key={i} style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.7, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
                  <span className="badge badge-normal" style={{ fontSize: 12, marginRight: 8 }}>{p.caseNo}</span>
                  {p.gist}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
