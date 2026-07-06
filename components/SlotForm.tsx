'use client';
import { useMemo, useState } from 'react';
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

  const missing = validateSlots(caseTypeId, slots);
  const canSubmit = missing.length === 0 && !submitting;

  function setValue(key: string, value: string) {
    setSlots((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (missing.length === 0) onSubmit(slots, isSpecialEd);
      }}
    >
      <div style={{ display: 'grid', gap: 24 }}>
        {type.slots.map((slot) => {
          const showError = touched && slot.required && (!slots[slot.key] || slots[slot.key].trim() === '');
          return (
            <div key={slot.key}>
              <label>
                {slot.label} {slot.required && <span className="required-star">*</span>}
              </label>
              {slot.multiline ? (
                <textarea rows={3} placeholder={slot.placeholder} value={slots[slot.key] ?? ''} onChange={(e) => setValue(slot.key, e.target.value)} />
              ) : (
                <input type="text" placeholder={slot.placeholder} value={slots[slot.key] ?? ''} onChange={(e) => setValue(slot.key, e.target.value)} />
              )}
              {showError && <div className="field-error">이 항목은 필수입니다.</div>}
            </div>
          );
        })}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={isSpecialEd} onChange={(e) => setIsSpecialEd(e.target.checked)} />
          이 학생은 특수교육대상자입니다 (관련 조항을 함께 인용)
        </label>
        <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
          {submitting ? '생성 중…' : '누가기록 생성'}
        </button>
      </div>
    </form>
  );
}
