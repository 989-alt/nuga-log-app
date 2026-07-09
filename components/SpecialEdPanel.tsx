'use client';
import type { SpecialEdInfo } from '@/lib/types';
import { DISABILITY_CATEGORIES, isValidDisabilityKey } from '@/lib/specialEd';

export function toggleDisability(list: string[], key: string): string[] {
  if (!isValidDisabilityKey(key)) return list;
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

export default function SpecialEdPanel({ value, onChange }: { value: SpecialEdInfo; onChange: (v: SpecialEdInfo) => void }) {
  return (
    <div className="field">
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={value.isSpecialEd}
          onChange={(e) => onChange({ isSpecialEd: e.target.checked, disabilities: e.target.checked ? value.disabilities : [] })}
        />
        <span>이 학생은 <strong style={{ fontWeight: 600 }}>특수교육대상자</strong>입니다</span>
      </label>
      {value.isSpecialEd && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginTop: 10 }}>
          {DISABILITY_CATEGORIES.map((c) => (
            <label key={c.key} className="checkbox-row" style={{ fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={value.disabilities.includes(c.key)}
                onChange={() => onChange({ ...value, disabilities: toggleDisability(value.disabilities, c.key) })}
              />
              <span>{c.label}</span>
            </label>
          ))}
          <p className="help" style={{ gridColumn: '1 / -1', margin: '2px 0 0' }}>장애 유형은 지도 방법·법적 분석에만 참고하며 NEIS 본문에는 넣지 않습니다.</p>
        </div>
      )}
    </div>
  );
}
