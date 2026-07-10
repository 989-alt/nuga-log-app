import type { SlotDef } from '@/lib/types';

// 후속 기록 인터뷰에서 수집하는 슬롯. 유형(caseTypeId)에 무관하게 항상 고정된
// 5종을 사용한다(원 사건의 유형별 슬롯과는 별개).
export const FOLLOWUP_SLOTS: SlotDef[] = [
  {
    key: 'followUpAction',
    label: '수행한 절차',
    placeholder: '예: 보호자 통보, 상담 실시, 협의회 개최, 재관찰, 전문기관 연계, 신고',
    required: true,
    multiline: true,
  },
  {
    key: 'datetime',
    label: '수행 일시',
    placeholder: '예: 2026-07-10 15시',
    required: true,
    multiline: false,
  },
  {
    key: 'counterpart',
    label: '상대·참여자',
    placeholder: '예: 보호자(모), 담임·학년부장',
    required: false,
    multiline: false,
  },
  {
    key: 'outcome',
    label: '내용·결과',
    placeholder: '예: 통보 내용과 보호자 반응, 협의회 결정 사항',
    required: true,
    multiline: true,
  },
  {
    key: 'nextStep',
    label: '다음 계획',
    placeholder: '예: 2주 뒤 재관찰, 상담 지속 예정',
    required: false,
    multiline: true,
  },
];

/** 필수(*) 후속 슬롯 중 비어 있는 키 목록을 반환한다. */
export function validateFollowUpSlots(slots: Record<string, string>): string[] {
  const missing: string[] = [];
  for (const slot of FOLLOWUP_SLOTS) {
    if (!slot.required) continue;
    const value = slots[slot.key];
    if (!value || value.trim() === '') missing.push(slot.key);
  }
  return missing;
}

/** 프롬프트에 넣을 "키*(라벨), 키(라벨), ..." 한 줄 스펙. */
export function followUpSlotSpecLine(): string {
  return FOLLOWUP_SLOTS.map((s) => `${s.key}${s.required ? '*' : ''}(${s.label})`).join(', ');
}
