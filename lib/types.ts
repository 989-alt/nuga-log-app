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

export interface AiConfig {
  mode: 'free' | 'byok';
  provider?: AiProvider;
  apiKey?: string;
  model?: string;
}

export interface GenerateRequest {
  caseTypeId: CaseTypeId;
  slots: Record<string, string>;
  isSpecialEd: boolean;
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
}
