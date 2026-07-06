import type { AiConfig, AiProvider, ThinkingLevel } from '@/lib/types';

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  // gemini-2.5-flash is in the current free tier; gemini-2.0-flash's free-tier
  // request quota was set to 0 by Google (retired from free tier), causing 429.
  gemini: 'gemini-2.5-flash',
  claude: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
};

const PROVIDER_LABEL: Record<AiProvider, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'OpenAI' };

/** Provider HTTP failure. Carries the upstream status so the API route can
 *  surface a truthful code (429 rate limit, 401 bad key, …) instead of 500. */
export class LlmError extends Error {
  status: number;
  provider: AiProvider;
  /** 제공자가 알려 준 대기 권장 시간(초). 429일 때만 채워진다. */
  retryAfterSec?: number;
  constructor(status: number, provider: AiProvider, retryAfterSec?: number) {
    super(`${PROVIDER_LABEL[provider]} 오류 (${status})`);
    this.name = 'LlmError';
    this.status = status;
    this.provider = provider;
    this.retryAfterSec = retryAfterSec;
  }
}

interface CallArgs {
  system: string;
  user: string;
  ai: AiConfig;
  fetchImpl?: typeof fetch;
  geminiKey?: string;
  /** Backoff before the single retry on 429/503. Defaults to 2000ms; tests pass 0. */
  retryDelayMs?: number;
}

export async function callLlm(args: CallArgs): Promise<string> {
  const doFetch = args.fetchImpl ?? fetch;
  const delay = args.retryDelayMs ?? 2000;
  if (args.ai.mode === 'free') {
    const key = args.geminiKey ?? '';
    if (!key) throw new Error('AI 키가 없습니다');
    return callGemini(args.system, args.user, key, DEFAULT_MODELS.gemini, doFetch, delay, args.ai.thinkingLevel);
  }
  const provider = args.ai.provider;
  const key = args.ai.apiKey ?? '';
  if (!key) throw new Error('AI 키가 없습니다');
  const model = args.ai.model && args.ai.model.trim() !== '' ? args.ai.model.trim() : undefined;
  switch (provider) {
    case 'gemini':
      return callGemini(args.system, args.user, key, model ?? DEFAULT_MODELS.gemini, doFetch, delay, args.ai.thinkingLevel);
    case 'claude':
      return callClaude(args.system, args.user, key, model ?? DEFAULT_MODELS.claude, doFetch, delay);
    case 'openai':
      return callOpenai(args.system, args.user, key, model ?? DEFAULT_MODELS.openai, doFetch, delay);
    default:
      throw new Error('지원하지 않는 provider');
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Waits longer than this are NOT held open on the server (serverless timeout
// risk); they bubble up as LlmError.retryAfterSec for the client to schedule.
const QUICK_RETRY_MAX_MS = 5000;

/** Provider's suggested wait in seconds, or null. Reads the Retry-After header
 *  (OpenAI/Anthropic) and the Gemini 429 body ("retryDelay":"25s" / "retry in 25.9s"). */
async function extractRetrySeconds(res: Response): Promise<number | null> {
  const h = res.headers?.get?.('retry-after');
  if (h) {
    const s = Number(h);
    if (!Number.isNaN(s) && s >= 0) return Math.min(Math.ceil(s), 300);
  }
  try {
    const txt = await res.text();
    const m = txt.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i) ?? txt.match(/retry in ([\d.]+)\s*s/i);
    if (m) return Math.min(Math.ceil(Number(m[1])), 300);
  } catch { /* body unreadable */ }
  return null;
}

/** Fetch, returning the ok Response. On 429/503: retries once in-process only if
 *  the suggested wait is short; otherwise throws LlmError carrying retryAfterSec
 *  so the caller (client) can wait the right amount and retry. */
async function requestWithRetry(
  doFetch: typeof fetch,
  url: string,
  init: RequestInit,
  provider: AiProvider,
  delayMs: number
): Promise<Response> {
  let attempted = false;
  for (;;) {
    const res = await doFetch(url, init);
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status === 503;
    if (retryable && !attempted) {
      attempted = true;
      const hintSec = await extractRetrySeconds(res);
      const waitMs = hintSec != null ? hintSec * 1000 : delayMs;
      if (waitMs <= QUICK_RETRY_MAX_MS) {
        if (waitMs > 0) await sleep(waitMs);
        continue;
      }
      throw new LlmError(res.status, provider, hintSec ?? undefined);
    }
    const hintSec = retryable ? await extractRetrySeconds(res) : undefined;
    throw new LlmError(res.status, provider, hintSec ?? undefined);
  }
}

/** Gemini thinkingBudget 매핑. dynamic/미지정은 thinkingConfig 자체를 생략(모델 자율). */
function thinkingConfigFor(level?: ThinkingLevel): { thinkingBudget: number } | undefined {
  if (level === 'off') return { thinkingBudget: 0 };
  if (level === 'light') return { thinkingBudget: 512 };
  return undefined;
}

async function callGemini(system: string, user: string, key: string, model: string, doFetch: typeof fetch, delayMs: number, thinking?: ThinkingLevel): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const tc = thinkingConfigFor(thinking);
  const res = await requestWithRetry(doFetch, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.3, ...(tc ? { thinkingConfig: tc } : {}) },
    }),
  }, 'gemini', delayMs);
  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  if (!text) throw new Error('Gemini 응답이 비어 있습니다');
  return text;
}

async function callClaude(system: string, user: string, key: string, model: string, doFetch: typeof fetch, delayMs: number): Promise<string> {
  const res = await requestWithRetry(doFetch, 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  }, 'claude', delayMs);
  const data: any = await res.json();
  const text = data?.content?.map((b: any) => (b.type === 'text' ? b.text : '')).join('') ?? '';
  if (!text) throw new Error('Claude 응답이 비어 있습니다');
  return text;
}

async function callOpenai(system: string, user: string, key: string, model: string, doFetch: typeof fetch, delayMs: number): Promise<string> {
  const res = await requestWithRetry(doFetch, 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  }, 'openai', delayMs);
  const data: any = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('OpenAI 응답이 비어 있습니다');
  return text;
}

const FALLBACK_TAILS: Record<AiProvider, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  claude: [DEFAULT_MODELS.claude],
  openai: [DEFAULT_MODELS.openai],
};

/** 선호 모델 + 제공자별 저비용 폴백 꼬리. 중복 제거, 순서 유지. */
export function buildLadder(ai: AiConfig): string[] {
  const provider: AiProvider = ai.mode === 'free' ? 'gemini' : (ai.provider ?? 'gemini');
  const preferred = (ai.model && ai.model.trim() !== '') ? ai.model.trim() : DEFAULT_MODELS[provider];
  const ladder = [preferred, ...FALLBACK_TAILS[provider]];
  return ladder.filter((m, i) => ladder.indexOf(m) === i);
}
