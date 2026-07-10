export type CaseTypeId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface SlotDef {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  multiline: boolean;
}

export interface CaseType {
  id: CaseTypeId;
  name: string;
  shortName: string;
  lengthHint: string;
  highRisk: boolean;
  skeleton: string;
  bases: string[];
  lawQueries: string[];
  slots: SlotDef[];
}

export type AiProvider = 'gemini' | 'claude' | 'openai';

// Gemini 추론(thinking) 예산 스위치. off=0, light=512, dynamic=모델 자율(현재 기본).
export type ThinkingLevel = 'off' | 'light' | 'dynamic';

export interface AiConfig {
  mode: 'free' | 'byok';
  provider?: AiProvider;
  apiKey?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
}

export interface SpecialEdInfo {
  isSpecialEd: boolean;
  disabilities: string[]; // DISABILITY_CATEGORIES의 key들
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatTurnRequest {
  messages: ChatMessage[];
  slots: Record<string, string>;
  caseTypeId: CaseTypeId | null;
  specialEd: SpecialEdInfo;
  ai: AiConfig;
}

export interface ChatTurnResponse {
  assistantMessage: string;
  caseTypeId: CaseTypeId | null;
  slotUpdates: Record<string, string>;
  readyToGenerate: boolean;
}

export interface LegalProtection {
  element: string; // 방어 요건/논점
  support: string; // 사안 사실 ↔ 근거 연결 설명
  caseRefs: string[]; // 실제 검색된 판례 사건번호
}

// 아직 이행되지 않은 필수 절차 안내 항목. 본문에는 완료 사실만 적고,
// 미완 절차는 이 배열로 안내한다(절차 구분 원칙).
export interface ActionItem {
  task: string; // 지금 수행할 절차
  how: string; // 수행 후 누가기록에 추가로 기록할 문구 예시
}

export interface GenerateRequest {
  caseTypeId: CaseTypeId;
  slots: Record<string, string>;
  specialEd: SpecialEdInfo;
  ai: AiConfig;
}

export interface ResultMeta {
  bases: string;
  caseType: string;
  charCount: string;
  guidanceStep: string;
  guardianNotice: string;
  followUp: string;
}

export interface GenerateResult {
  body: string;
  meta: ResultMeta;
  teacherUnderstanding: string[];
  safeGuidance: string[];
  teacherMemo: string[];
  warnings: string[];
  legalProtection: LegalProtection[];
  actionItems?: ActionItem[];
  usedModel?: string;
  fallbackNote?: string;
}
