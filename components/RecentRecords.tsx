'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { HistoryItem } from '@/lib/history';
import { loadHistory, clearHistory } from '@/lib/history';
import { getCaseType } from '@/lib/caseTypes';
import { neisText } from '@/lib/format';

export default function RecentRecords({ onFollowUp }: { onFollowUp?: (item: HistoryItem) => void }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => { setItems(loadHistory()); }, []);

  // 마운트 전(SSR) → 아무것도 렌더하지 않아 첫 방문 화면을 깔끔하게 유지.
  if (!items) return null;

  async function copy(item: HistoryItem) {
    try {
      await navigator.clipboard.writeText(neisText(item.result));
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((c) => (c === item.id ? null : c)), 1500);
    } catch { /* 클립보드 차단 시 무시 */ }
  }

  function doClear() {
    clearHistory();
    setItems([]);
    setConfirmClear(false);
  }

  function followUp(item: HistoryItem) {
    onFollowUp?.(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (items.length === 0) {
    return (
      <section style={{ marginTop: 12, textAlign: 'center', padding: '20px 0' }}>
        <Image
          src="/glass/icon-folder.png"
          alt=""
          width={96}
          height={96}
          style={{ borderRadius: 20, margin: '0 auto 16px', display: 'block' }}
        />
        <p style={{ fontSize: 14.5, color: 'var(--ink-muted)', lineHeight: 1.6 }}>
          아직 기록이 없어요. 첫 사안을 대화로 알려 주세요.
        </p>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Image src="/glass/icon-folder.png" alt="" width={28} height={28} style={{ borderRadius: 8, flexShrink: 0 }} />
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>최근 기록</div>
            <div style={{ fontSize: 14, color: 'var(--ink-muted)' }}>이 브라우저에만 저장된 기록입니다.</div>
          </div>
        </div>
        {confirmClear ? (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>모두 지울까요?</span>
            <button type="button" onClick={doClear} style={linkBtn('var(--danger)')}>지우기</button>
            <button type="button" onClick={() => setConfirmClear(false)} style={linkBtn('var(--ink-muted)')}>취소</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmClear(true)} style={linkBtn('var(--ink-muted)')}>전체 지우기</button>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((item) => {
          const type = getCaseType(item.caseTypeId);
          const snippet = item.result.body.length > 96 ? item.result.body.slice(0, 96) + '…' : item.result.body;
          return (
            <div key={item.id} className="card" style={{ padding: 18, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span className={type.highRisk ? 'badge badge-risk' : 'badge badge-neutral'}>{type.shortName}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>{item.date}</span>
                  {item.parentId && (
                    <span
                      className="badge"
                      style={{ background: 'var(--accent-weak)', color: 'var(--accent)' }}
                    >
                      ↳ 후속
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{snippet}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <button type="button" className="btn btn-ghost" style={{ padding: '9px 14px', fontSize: 13 }} onClick={() => copy(item)}>
                  {copiedId === item.id ? '복사됨' : '복사'}
                </button>
                {onFollowUp && (
                  <button type="button" className="btn btn-ghost" style={{ padding: '9px 14px', fontSize: 13 }} onClick={() => followUp(item)}>
                    후속 기록 작성
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function linkBtn(color: string): React.CSSProperties {
  return { background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 500, color };
}
