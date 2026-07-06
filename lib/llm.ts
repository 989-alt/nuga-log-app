import type { AiConfig, AiProvider } from '@/lib/types';

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  // gemini-2.5-flash is in the current free tier; gemini-2.0-flash's free-tier
  // request quota was set to 0 by Google (retired from free tier), causing 429.
  gemini: 'gemini-2.5-flash',
  claude: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
};

interface CallArgs {
  system: string;
  user: string;
  ai: AiConfig;
  fetchImpl?: typeof fetch;
  geminiKey?: string;
}

export async function callLlm(args: CallArgs): Promise<string> {
  const doFetch = args.fetchImpl ?? fetch;
  if (args.ai.mode === 'free') {
    const key = args.geminiKey ?? '';
    if (!key) throw new Error('AI 키가 없습니다');
    return callGemini(args.system, args.user, key, DEFAULT_MODELS.gemini, doFetch);
  }
  const provider = args.ai.provider;
  const key = args.ai.apiKey ?? '';
  if (!key) throw new Error('AI 키가 없습니다');
  const model = args.ai.model && args.ai.model.trim() !== '' ? args.ai.model.trim() : undefined;
  switch (provider) {
    case 'gemini':
      return callGemini(args.system, args.user, key, model ?? DEFAULT_MODELS.gemini, doFetch);
    case 'claude':
      return callClaude(args.system, args.user, key, model ?? DEFAULT_MODELS.claude, doFetch);
    case 'openai':
      return callOpenai(args.system, args.user, key, model ?? DEFAULT_MODELS.openai, doFetch);
    default:
      throw new Error('지원하지 않는 provider');
  }
}

async function callGemini(system: string, user: string, key: string, model: string, doFetch: typeof fetch): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await doFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini 오류 (${res.status})`);
  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  if (!text) throw new Error('Gemini 응답이 비어 있습니다');
  return text;
}

async function callClaude(system: string, user: string, key: string, model: string, doFetch: typeof fetch): Promise<string> {
  const res = await doFetch('https://api.anthropic.com/v1/messages', {
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
  });
  if (!res.ok) throw new Error(`Claude 오류 (${res.status})`);
  const data: any = await res.json();
  const text = data?.content?.map((b: any) => (b.type === 'text' ? b.text : '')).join('') ?? '';
  if (!text) throw new Error('Claude 응답이 비어 있습니다');
  return text;
}

async function callOpenai(system: string, user: string, key: string, model: string, doFetch: typeof fetch): Promise<string> {
  const res = await doFetch('https://api.openai.com/v1/chat/completions', {
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
  });
  if (!res.ok) throw new Error(`OpenAI 오류 (${res.status})`);
  const data: any = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('OpenAI 응답이 비어 있습니다');
  return text;
}
