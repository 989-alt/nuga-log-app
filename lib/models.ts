import type { AiProvider } from '@/lib/types';
import { LlmError } from '@/lib/llm';

/**
 * 사용자의 키로 제공자 계정에서 "텍스트 생성" 모델 목록을 가져온다.
 * 서버(라우트)에서만 호출한다 — 키는 요청 처리에만 쓰고 저장·로그하지 않으며,
 * 브라우저 CORS 문제도 피한다. 실패 시 LlmError(status)를 던진다.
 */
export async function listTextModels(
  provider: AiProvider,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<string[]> {
  switch (provider) {
    case 'gemini': return listGemini(apiKey, fetchImpl);
    case 'claude': return listClaude(apiKey, fetchImpl);
    case 'openai': return listOpenai(apiKey, fetchImpl);
    default: throw new Error('지원하지 않는 provider');
  }
}

async function listGemini(key: string, doFetch: typeof fetch): Promise<string[]> {
  const res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1000`);
  if (!res.ok) throw new LlmError(res.status, 'gemini');
  const data: any = await res.json();
  const models: any[] = Array.isArray(data?.models) ? data.models : [];
  return models
    // 텍스트 생성 = generateContent 지원. 임베딩/aqa 등은 제외됨.
    .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => String(m?.name ?? '').replace(/^models\//, ''))
    // 텍스트가 아닌 산출물(이미지·TTS·오디오·영상·음악·로보틱스·임베딩·에이전트) 모델 제외.
    .filter((id) => id && !/embedding|aqa|imagen|image|tts|audio|veo|computer-use|lyria|banana|robotics/i.test(id))
    .sort();
}

async function listClaude(key: string, doFetch: typeof fetch): Promise<string[]> {
  const res = await doFetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  });
  if (!res.ok) throw new LlmError(res.status, 'claude');
  const data: any = await res.json();
  const models: any[] = Array.isArray(data?.data) ? data.data : [];
  // Claude 모델은 모두 텍스트 생성. 최신순으로 내려오므로 순서 유지.
  return models.map((m) => String(m?.id ?? '')).filter((id) => id.startsWith('claude-'));
}

const OPENAI_EXCLUDE = /(embedding|whisper|tts|audio|realtime|dall-e|dalle|moderation|image|transcribe|-instruct|search|codex)/i;

async function listOpenai(key: string, doFetch: typeof fetch): Promise<string[]> {
  const res = await doFetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new LlmError(res.status, 'openai');
  const data: any = await res.json();
  const models: any[] = Array.isArray(data?.data) ? data.data : [];
  return models
    .map((m) => String(m?.id ?? ''))
    // 챗/텍스트 모델만: gpt-*, o1/o3/o4-*, chatgpt-*. 그 외 모달리티 제외.
    .filter((id) => /^(gpt-|o1|o3|o4|chatgpt)/.test(id) && !OPENAI_EXCLUDE.test(id))
    .sort();
}
