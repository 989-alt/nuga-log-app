'use client';
import { useMemo, useRef, useState } from 'react';
import type { CaseTypeId } from '@/lib/types';
import { getCaseType } from '@/lib/caseTypes';
import { validateSlots } from '@/lib/validation';

export default function SlotForm({
  caseTypeId,
  onSubmit,
  submitting,
}: {
  caseTypeId: CaseTypeId;
  onSubmit: (slots: Record<string, string>, isSpecialEd: boolean) => void;
  submitting: boolean;
}) {
  const type = useMemo(() => getCaseType(caseTypeId), [caseTypeId]);
  const [slots, setSlots] = useState<Record<string, string>>({});
  const [isSpecialEd, setIsSpecialEd] = useState(false);
  const [touched, setTouched] = useState(false);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const missing = validateSlots(caseTypeId, slots);
  const showErrors = touched && missing.length > 0;

  function setValue(key: string, value: string) {
    setSlots((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (missing.length === 0) {
      onSubmit(slots, isSpecialEd);
      return;
    }
    // 첫 빈 필수 항목으로 이동·포커스 — 왜 제출이 안 되는지 즉시 보이게.
    const first = fieldRefs.current[missing[0]];
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (first?.querySelector('input, textarea') as HTMLElement | undefined)?.focus({ preventScroll: true });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {type.slots.map((slot) => {
        const invalid = showErrors && slot.required && (!slots[slot.key] || slots[slot.key].trim() === '');
        const errId = `err-${slot.key}`;
        return (
          <div className="field" key={slot.key} ref={(el) => { fieldRefs.current[slot.key] = el; }}>
            <label className="label" htmlFor={slot.key}>
              {slot.label} {slot.required && <span className="required-star" aria-hidden>*</span>}
            </label>
            {slot.multiline ? (
              <textarea
                id={slot.key} rows={3} placeholder={slot.placeholder}
                className={invalid ? 'input-error' : undefined}
                aria-invalid={invalid} aria-describedby={invalid ? errId : undefined}
                value={slots[slot.key] ?? ''} onChange={(e) => setValue(slot.key, e.target.value)}
              />
            ) : (
              <input
                id={slot.key} type="text" placeholder={slot.placeholder}
                className={invalid ? 'input-error' : undefined}
                aria-invalid={invalid} aria-describedby={invalid ? errId : undefined}
                value={slots[slot.key] ?? ''} onChange={(e) => setValue(slot.key, e.target.value)}
              />
            )}
            {invalid && <div className="field-error" id={errId}><span aria-hidden>▲</span> 이 항목은 필수입니다.</div>}
          </div>
        );
      })}

      <div className="field">
        <label className="checkbox-row">
          <input type="checkbox" checked={isSpecialEd} onChange={(e) => setIsSpecialEd(e.target.checked)} />
          <span>이 학생은 <strong style={{ fontWeight: 600 }}>특수교육대상자</strong>입니다 <span className="muted">(관련 조항을 함께 인용)</span></span>
        </label>
      </div>

      {showErrors && (
        <div className="callout callout-danger" style={{ marginTop: 24 }}>
          필수 항목 {missing.length}개를 입력해 주세요. 빈 칸이 위에 표시되어 있습니다.
        </div>
      )}

      <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={submitting} style={{ marginTop: 24 }}>
        {submitting ? (<><span className="spinner" aria-hidden /> 생성 중…</>) : '누가기록 생성'}
      </button>
      <p className="help" style={{ textAlign: 'center', marginTop: 12 }}>
        생성된 기록은 초안입니다. 사실관계와 표현을 반드시 검토한 뒤 NEIS에 입력하세요.
      </p>
    </form>
  );
}
