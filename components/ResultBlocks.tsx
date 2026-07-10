'use client';
import { useState } from 'react';
import type { GenerateResult } from '@/lib/types';
import { fullRecordText, recordFilename } from '@/lib/recordText';
import { supportsDirectorySave, saveViaPicker, downloadText } from '@/lib/fileSave';
import LegalProtectionBlock from '@/components/LegalProtectionBlock';

type Copied = 'body' | 'all' | null;

export default function ResultBlocks({ result }: { result: GenerateResult }) {
  const [copied, setCopied] = useState<Copied>(null);
  const [saved, setSaved] = useState(false);

  async function copy(which: Copied, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
    } catch { /* 클립보드 차단 시 사용자가 직접 선택 복사 */ }
  }

  async function save() {
    const name = recordFilename(result, new Date().toISOString().slice(0, 10));
    const text = fullRecordText(result);
    if (supportsDirectorySave()) {
      const res = await saveViaPicker(name, text);
      if (res === 'unsupported') {
        downloadText(name, text);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } else if (res === 'saved') {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
      // 'cancelled'면 아무것도 안 함
    } else {
      downloadText(name, text);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  const metaRows: [string, string][] = [
    ['근거', result.meta.bases],
    ['유형', result.meta.caseType],
    ['글자수', result.meta.charCount],
    ['지도 단계', result.meta.guidanceStep],
    ['보호자 통보', result.meta.guardianNotice],
    ['후속', result.meta.followUp],
  ];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {result.warnings.length > 0 && (
        <div className="callout callout-warning">
          {result.warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {/* 핵심 산출물 — NEIS 본문 */}
      <div className="card" style={{ borderLeft: '3px solid var(--accent)', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '18px 24px', borderBottom: '1px solid var(--line)', background: 'var(--surface-sunken)' }}>
          <span className="badge badge-normal">NEIS 붙여넣기용 · 평어 종결</span>
          <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" style={{ padding: '9px 16px', fontSize: 13.5 }} onClick={() => copy('body', result.body)}>
              {copied === 'body' ? '✓ 복사됨' : '본문 복사'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ padding: '9px 16px', fontSize: 13.5 }} onClick={() => copy('all', fullRecordText(result))}>
              {copied === 'all' ? '✓ 복사됨' : '전체 복사'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ padding: '9px 16px', fontSize: 13.5 }} onClick={save}>
              {saved ? '✓ 저장했습니다' : supportsDirectorySave() ? '누가기록 폴더에 저장' : '다운로드'}
            </button>
          </span>
        </div>

        <div style={{ padding: '22px 24px' }}>
          <p style={{ fontSize: 16.5, lineHeight: 1.95, color: 'var(--ink)', wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
            {result.body}
          </p>
        </div>

        <dl style={{ margin: 0, padding: '4px 24px 22px', display: 'grid', gap: 1, background: 'var(--line)', borderTop: '1px solid var(--line)' }}>
          {metaRows.map(([k, v]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 14, background: 'var(--surface)', padding: '11px 0' }}>
              <dt style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)' }}>{k}</dt>
              <dd style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)', wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <TeacherBlock title="교사 이해용 — 법령·판례 풀이" items={result.teacherUnderstanding} />
      <TeacherBlock title="향후 안전한 지도 방법" items={result.safeGuidance} />
      <TeacherBlock title="교사 보관 메모" items={result.teacherMemo} />
      <LegalProtectionBlock items={result.legalProtection} />
    </div>
  );
}

function TeacherBlock({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{title}</span>
        <span className="badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>NEIS에 붙여넣지 말 것</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 9 }}>
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.7, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
