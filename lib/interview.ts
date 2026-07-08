import type { CaseTypeId, SpecialEdInfo } from '@/lib/types';
import { CASE_TYPES } from '@/lib/caseTypes';
import { validateSlots } from '@/lib/validation';
import { disabilityLabels } from '@/lib/specialEd';

export function buildInterviewSystemPrompt(specialEd: SpecialEdInfo): string {
  const typeList = CASE_TYPES.map((c) => `${c.id}. ${c.name}`).join(' / ');
  const lines = [
    '당신은 대한민국 초·중등 교사와 대화하며 NEIS 누가기록에 필요한 사실을 인터뷰로 수집하는 도우미다.',
    '교사가 사안을 자유롭게 서술하면 아래 7유형 중 하나로 분류한다(애매하면 한 줄로 확인).',
    `유형: ${typeList}`,
    '수집 원칙:',
    '- 한 번에 1~3개씩만 질문한다. 한꺼번에 많이 묻지 않는다.',
    '- 필수 사실: 일시(연·월·일·요일·교시), 장소, 관찰된 행동, 교사 발화와 학생 발화(직접인용 1쌍 이상), 적용한 지도 단계, 학생 반응, 보호자 통보(시각·수단), 후속 조치.',
    '- 평가어로 답하면 구체 관찰 행동을 되묻는다. 추측으로 빈칸을 채우지 않는다.',
    '- 아동학대가 의심되면 신고 의무를 먼저 안내한다.',
    specialEd.isSpecialEd
      ? `- 대상 학생은 특수교육대상자다(${disabilityLabels(specialEd.disabilities).join(', ') || '유형 미상'}). 장애 특성을 고려하되, 장애 유형을 본문에 넣지 말고 행동 중심으로 수집한다.`
      : '',
    '매 턴 아래 JSON 하나만 출력한다. 설명·코드펜스 금지.',
    '{"assistantMessage":"교사에게 할 다음 질문 또는 안내","caseTypeId":1~7 또는 null,"slotUpdates":{"슬롯키":"값"},"readyToGenerate":true/false}',
    'slotUpdates의 키는 분류한 유형의 슬롯 키를 사용한다. 필수 사실이 모두 모이기 전에는 readyToGenerate를 true로 하지 않는다.',
  ].filter((l) => l !== '');
  return lines.join('\n');
}

interface Turn {
  assistantMessage: string;
  caseTypeId: CaseTypeId | null;
  slotUpdates: Record<string, string>;
  readyToGenerate: boolean;
}

export function parseInterviewTurn(raw: string): Turn {
  let text = raw.trim().replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AI 응답을 해석하지 못했습니다');
  let obj: any;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('AI 응답을 해석하지 못했습니다');
  }
  const idNum = Number(obj.caseTypeId);
  const caseTypeId = idNum >= 1 && idNum <= 7 ? (idNum as CaseTypeId) : null;
  const slotUpdates: Record<string, string> = {};
  if (obj.slotUpdates && typeof obj.slotUpdates === 'object') {
    for (const [k, v] of Object.entries(obj.slotUpdates)) {
      if (typeof v === 'string' && v.trim() !== '') slotUpdates[k] = v.trim();
    }
  }
  return {
    assistantMessage: String(obj.assistantMessage ?? ''),
    caseTypeId,
    slotUpdates,
    readyToGenerate: obj.readyToGenerate === true,
  };
}

/** 게이트: 유형 미확정이거나 필수슬롯이 남아 있으면 생성 불가. */
export function applyGate(
  modelReady: boolean,
  mergedSlots: Record<string, string>,
  caseTypeId: CaseTypeId | null
): boolean {
  if (!modelReady) return false;
  if (caseTypeId === null) return false;
  return validateSlots(caseTypeId, mergedSlots).length === 0;
}
