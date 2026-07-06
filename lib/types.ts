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

export interface GenerateRequest {
  caseTypeId: CaseTypeId;
  slots: Record<string, string>;
  isSpecialEd: boolean;
  ai: AiConfig;
  refineMode?: boolean;
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
  usedModel?: string;
  fallbackNote?: string;
  refined?: boolean;
}
