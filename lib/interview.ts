import type { CaseTypeId, FollowUpContext, SpecialEdInfo } from '@/lib/types';
import { CASE_TYPES, getCaseType } from '@/lib/caseTypes';
import { validateSlots } from '@/lib/validation';
import { disabilityLabels } from '@/lib/specialEd';
import { groundingText } from '@/lib/legalKb';
import { followUpSlotSpecLine, validateFollowUpSlots } from '@/lib/followUp';

// buildInterviewSystemPrompt와 buildFollowUpInterviewPrompt가 공유하는 조각들.
// (기존 buildInterviewSystemPrompt의 출력 문자열은 한 글자도 바꾸지 않는다 — 아래 함수들은
// 그 함수 밖에서, 후속 인터뷰 프롬프트를 조립하는 데만 쓰인다.)
function guidanceSuggestionLine(): string {
  return '- 교사가 지도 방법을 모르겠다고 하거나 어떻게 해야 할지 물으면, 위 법령·판례와 교육학적 원칙(비례성, 단계적 개입, 긍정행동지원)에 근거한 지도 방법을 2~3가지 제안하고 각 방법의 근거(조문·판례 번호)를 assistantMessage 안에 함께 밝힌다.';
}

function reviseOnNoLine(): string {
  return '- 교사가 초안 생성 확인에 아니오라고 답하거나 추가·수정할 내용이 있다고 하면, 어떤 내용을 추가·수정할지 구체적으로 되묻는다(readyToGenerate는 다시 false).';
}

function jsonOnlyLine(): string {
  return '매 턴 아래 JSON 하나만 출력한다. 설명·코드펜스 금지.';
}

function slotSpecLines(): string[] {
  return CASE_TYPES.map((c) => {
    const parts = c.slots.map((s) => `${s.key}${s.required ? '*' : ''}(${s.label})`).join(', ');
    return `${c.id} ${c.name}: ${parts}`;
  });
}

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
    '- 행동이 반복된 사안이면 정확한 횟수(불확실하면 최소 횟수)와 각 반복 시 교사의 대응, 상황이 어떻게 종결되었는지를 반드시 묻는다.',
    '- 보호자 통보·관리자 보고·신고 같은 절차는 완료했는지 아직인지 구분해 묻고, 완료면 일시·수단·상대 반응까지, 미완이면 슬롯 값에 "미완(예정: ...)" 형태로 수집한다.',
    '- 다른 학생이 목격하거나 연루된 사안이면 다른 학생 보호를 위해 취한 조치를 묻는다.',
    specialEd.isSpecialEd
      ? `- 대상 학생은 특수교육대상자다(${disabilityLabels(specialEd.disabilities).join(', ') || '유형 미상'}). 장애 특성을 고려하되, 장애 유형을 본문에 넣지 말고 행동 중심으로 수집한다.`
      : '',
    '[참고 법령·판례]',
    groundingText(specialEd.isSpecialEd),
    '- 교사가 지도 방법을 모르겠다고 하거나 어떻게 해야 할지 물으면, 위 법령·판례와 교육학적 원칙(비례성, 단계적 개입, 긍정행동지원)에 근거한 지도 방법을 2~3가지 제안하고 각 방법의 근거(조문·판례 번호)를 assistantMessage 안에 함께 밝힌다.',
    '- 필수(*) 슬롯이 모두 모여 readyToGenerate를 true로 낼 때는, assistantMessage를 수집 내용 한 줄 요약 뒤 정확히 "이 내용을 바탕으로 NEIS 누가기록 초안을 생성할까요?" 로 끝맺는다.',
    '- 교사가 초안 생성 확인에 아니오라고 답하거나 추가·수정할 내용이 있다고 하면, 어떤 내용을 추가·수정할지 구체적으로 되묻는다(readyToGenerate는 다시 false).',
    '매 턴 아래 JSON 하나만 출력한다. 설명·코드펜스 금지.',
    '{"assistantMessage":"교사에게 할 다음 질문 또는 안내","caseTypeId":1~7 또는 null,"slotUpdates":{"슬롯키":"값"},"readyToGenerate":true/false}',
    'slotUpdates의 키는 아래 유형별 슬롯 키를 영문 그대로 사용한다(임의 키 금지). *표시는 필수 슬롯이다.',
    '유형별 슬롯 키:',
    ...slotSpecLines(),
    '분류한 유형의 필수(*) 슬롯 값이 모두 모이기 전에는 readyToGenerate를 true로 하지 않는다. 모두 모였으면 즉시 true로 한다.',
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

/**
 * 기존 누가기록(원 사건)을 컨텍스트로 제시하고, 그 후 교사가 밟은 절차를
 * 인터뷰하는 시스템 프롬프트. 원 사건의 유형·슬롯 인터뷰가 아니라 항상
 * FOLLOWUP_SLOTS(followUpAction/datetime/counterpart/outcome/nextStep)만 수집하며,
 * caseTypeId는 원 사건 값으로 고정한다.
 */
export function buildFollowUpInterviewPrompt(specialEd: SpecialEdInfo, followUp: FollowUpContext): string {
  const caseType = getCaseType(followUp.caseTypeId);
  const lines = [
    '당신은 대한민국 초·중등 교사와 대화하며 기존 누가기록의 후속 조치를 인터뷰로 수집하는 도우미다.',
    '아래는 원 사건 기록이다. 이 사실관계를 그대로 전제하고 다시 묻지 않는다. 이제부터는 교사가 이 사건 이후 밟은 절차를 확인한다.',
    `[원 사건] 일자: ${followUp.parentDate} / 유형: ${caseType.name}`,
    '[원 사건 본문]',
    followUp.parentBody,
    '수집 원칙:',
    '- 한 번에 1~3개씩만 질문한다. 한꺼번에 많이 묻지 않는다.',
    '- 원 사건 이후 교사가 실제로 밟은 절차(예: 보호자 통보 완료, 상담 실시, 협의회 개최, 재관찰 결과, 전문기관 연계, 신고)를 구체적으로 묻는다.',
    '- 완료된 절차의 사실만 다룬다. 언제·누구와·어떤 수단으로·어떤 결과였는지를 확인한다. 추측으로 빈칸을 채우지 않는다.',
    '- 평가어로 답하면 구체적인 사실을 되묻는다.',
    specialEd.isSpecialEd
      ? `- 대상 학생은 특수교육대상자다(${disabilityLabels(specialEd.disabilities).join(', ') || '유형 미상'}). 장애 특성을 고려하되, 장애 유형을 본문에 넣지 말고 행동 중심으로 수집한다.`
      : '',
    '[참고 법령·판례]',
    groundingText(specialEd.isSpecialEd),
    guidanceSuggestionLine(),
    '- 필수(*) 슬롯이 모두 모여 readyToGenerate를 true로 낼 때는, assistantMessage를 수집 내용 한 줄 요약 뒤 정확히 "이 내용을 바탕으로 후속 누가기록 초안을 생성할까요?" 로 끝맺는다.',
    reviseOnNoLine(),
    jsonOnlyLine(),
    `{"assistantMessage":"교사에게 할 다음 질문 또는 안내","caseTypeId":${followUp.caseTypeId},"slotUpdates":{"슬롯키":"값"},"readyToGenerate":true/false}`,
    `caseTypeId 필드는 항상 ${followUp.caseTypeId}로 고정해 출력한다(원 사건의 유형이며, 절대 다른 값으로 바꾸지 않는다).`,
    'slotUpdates의 키는 아래 후속 슬롯 키만 영문 그대로 사용한다(원 사건 유형의 슬롯 키나 그 밖의 임의 키 금지). *표시는 필수 슬롯이다.',
    '후속 슬롯 키:',
    followUpSlotSpecLine(),
    '필수(*) 후속 슬롯 값이 모두 모이기 전에는 readyToGenerate를 true로 하지 않는다. 모두 모였으면 즉시 true로 한다.',
  ].filter((l) => l !== '');
  return lines.join('\n');
}

/** 후속 기록 게이트: 모델이 준비됐다고 해도 필수 후속 슬롯이 남아 있으면 생성 불가. */
export function applyFollowUpGate(modelReady: boolean, mergedSlots: Record<string, string>): boolean {
  if (!modelReady) return false;
  return validateFollowUpSlots(mergedSlots).length === 0;
}
