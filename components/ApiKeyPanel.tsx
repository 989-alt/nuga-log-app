'use client';
import { useEffect, useState } from 'react';
import type { AiConfig, AiProvider } from '@/lib/types';
import { DEFAULT_MODELS } from '@/lib/llm';
import { loadAiSettings, saveAiSettings } from '@/lib/aiSettings';

export default function ApiKeyPanel({ onChange }: { onChange: (cfg: AiConfig) => void }) {
  const [cfg, setCfg] = useState<AiConfig>({ mode: 'free' });

  useEffect(() => {
    const loaded = loadAiSettings();
    setCfg(loaded);
    onChange(loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(next: AiConfig) {
    setCfg(next);
    saveAiSettings(next);
    onChange(next);
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 14, color: 'var(--color-steel)', marginBottom: 12 }}>AI 설정</div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}>
          <input type="radio" style={{ width: 'auto' }} checked={cfg.mode === 'free'} onChange={() => update({ mode: 'free' })} />
          무료 (Gemini)
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}>
          <input
            type="radio" style={{ width: 'auto' }} checked={cfg.mode === 'byok'}
            onChange={() => update({ mode: 'byok', provider: cfg.provider ?? 'gemini', apiKey: cfg.apiKey ?? '', model: cfg.model ?? '' })}
          />
          내 API 키 사용
        </label>
      </div>
      {cfg.mode === 'byok' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label>제공자</label>
            <select
              value={cfg.provider ?? 'gemini'}
              onChange={(e) => update({ ...cfg, provider: e.target.value as AiProvider })}
            >
              <option value="gemini">Google Gemini</option>
              <option value="claude">Anthropic Claude</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div>
            <label>API 키 (이 브라우저에만 저장, 서버에 저장하지 않음)</label>
            <input
              type="password" value={cfg.apiKey ?? ''} placeholder="sk-... 또는 AIza..."
              onChange={(e) => update({ ...cfg, apiKey: e.target.value })}
            />
          </div>
          <div>
            <label>모델 (비우면 기본값 {DEFAULT_MODELS[(cfg.provider ?? 'gemini') as AiProvider]})</label>
            <input
              type="text" value={cfg.model ?? ''} placeholder={DEFAULT_MODELS[(cfg.provider ?? 'gemini') as AiProvider]}
              onChange={(e) => update({ ...cfg, model: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
