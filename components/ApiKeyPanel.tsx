'use client';
import { useEffect, useState } from 'react';
import type { AiConfig, AiProvider } from '@/lib/types';
import { DEFAULT_MODELS } from '@/lib/llm';
import { loadAiSettings, saveAiSettings } from '@/lib/aiSettings';

const PROVIDER_LABEL: Record<AiProvider, string> = { gemini: 'Google Gemini', claude: 'Anthropic Claude', openai: 'OpenAI' };

export default function ApiKeyPanel({ onChange }: { onChange: (cfg: AiConfig) => void }) {
  const [cfg, setCfg] = useState<AiConfig>({ mode: 'free' });
  const [open, setOpen] = useState(false);

  // 모델 목록 (내 계정에서 불러온 텍스트 생성 모델)
  const [models, setModels] = useState<string[] | null>(null);
  const [manualModel, setManualModel] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadAiSettings();
    setCfg(loaded);
    onChange(loaded);
    if (loaded.mode === 'byok') setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(next: AiConfig) {
    setCfg(next);
    saveAiSettings(next);
    onChange(next);
  }

  function resetModelList() {
    setModels(null);
    setManualModel(false);
    setModelError(null);
  }

  const provider = (cfg.provider ?? 'gemini') as AiProvider;
  const hasKey = !!(cfg.apiKey && cfg.apiKey.trim());

  async function fetchModels() {
    if (!hasKey) { setModelError('API 키를 먼저 입력해 주세요.'); return; }
    setLoadingModels(true);
    setModelError(null);
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: (cfg.apiKey ?? '').trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModelError(data.error ?? '모델 목록을 불러오지 못했습니다.');
      } else if (!Array.isArray(data.models) || data.models.length === 0) {
        setModelError('사용 가능한 텍스트 생성 모델이 없습니다.');
      } else {
        setModels(data.models);
        setManualModel(false);
      }
    } catch {
      setModelError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoadingModels(false);
    }
  }

  const summary = cfg.mode === 'free'
    ? '무료 · Gemini'
    : `내 키 · ${PROVIDER_LABEL[provider].split(' ').pop()}`;

  return (
    <details className="disclosure" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} style={{ marginBottom: 20 }}>
      <summary>
        <span>생성 엔진 <span className="muted" style={{ fontWeight: 400 }}>(선택)</span></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--ink-muted)' }}>
          {summary}
          <span className="chev" aria-hidden>▾</span>
        </span>
      </summary>
      <div className="disclosure-body">
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={optStyle(cfg.mode === 'free')}>
            <input type="radio" style={{ width: 'auto' }} checked={cfg.mode === 'free'} onChange={() => { resetModelList(); update({ mode: 'free' }); }} />
            <span>
              <span style={{ fontWeight: 500, color: 'var(--ink)' }}>무료 (Gemini)</span>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-muted)' }}>키 없이 바로 사용. 사용량이 많으면 잠시 제한될 수 있습니다.</span>
            </span>
          </label>
          <label style={optStyle(cfg.mode === 'byok')}>
            <input
              type="radio" style={{ width: 'auto' }} checked={cfg.mode === 'byok'}
              onChange={() => update({ mode: 'byok', provider: cfg.provider ?? 'gemini', apiKey: cfg.apiKey ?? '', model: cfg.model ?? '' })}
            />
            <span>
              <span style={{ fontWeight: 500, color: 'var(--ink)' }}>내 API 키 사용</span>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-muted)' }}>Gemini · Claude · OpenAI. 제한 없이, 이 브라우저에만 저장됩니다.</span>
            </span>
          </label>
        </div>

        {cfg.mode === 'byok' && (
          <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
            <div className="field">
              <label className="label">제공자</label>
              <select value={provider} onChange={(e) => { resetModelList(); update({ ...cfg, provider: e.target.value as AiProvider }); }}>
                <option value="gemini">Google Gemini</option>
                <option value="claude">Anthropic Claude</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>

            <div className="field">
              <label className="label">API 키</label>
              <input
                type="password" value={cfg.apiKey ?? ''} placeholder="sk-... 또는 AIza..."
                onChange={(e) => { if (models) resetModelList(); update({ ...cfg, apiKey: e.target.value }); }}
              />
              <div className="help">이 브라우저에만 저장되고, 서버에 저장·기록하지 않습니다.</div>
            </div>

            <div className="field">
              <label className="label">모델 <span className="muted" style={{ fontWeight: 400 }}>(비우면 기본값 {DEFAULT_MODELS[provider]})</span></label>

              {models && !manualModel ? (
                <>
                  <select value={cfg.model ?? ''} onChange={(e) => update({ ...cfg, model: e.target.value })}>
                    <option value="">기본값 ({DEFAULT_MODELS[provider]})</option>
                    {models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <div className="help" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>텍스트 생성 모델 {models.length}개를 불러왔습니다.</span>
                    <button type="button" onClick={() => setManualModel(true)} style={linkBtn}>직접 입력</button>
                  </div>
                </>
              ) : (
                <>
                  <input
                    type="text" value={cfg.model ?? ''} placeholder={DEFAULT_MODELS[provider]}
                    onChange={(e) => update({ ...cfg, model: e.target.value })}
                  />
                  <div className="help" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <span style={modelError ? { color: 'var(--danger)' } : undefined}>
                      {modelError ?? '내 계정에서 사용 가능한 모델을 불러올 수 있습니다.'}
                    </span>
                    <button
                      type="button" className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 12.5, flexShrink: 0 }}
                      disabled={loadingModels || !hasKey} onClick={fetchModels}
                    >
                      {loadingModels ? (<><span className="spinner" style={{ borderColor: 'rgba(67,56,202,.35)', borderTopColor: 'var(--accent)' }} aria-hidden /> 불러오는 중…</>) : '모델 목록 불러오기'}
                    </button>
                  </div>
                </>
              )}
              {provider === 'gemini' && (
                <div className="help" style={{ marginTop: 8 }}>
                  무료 키는 <strong style={{ fontWeight: 600 }}>gemini-2.5-flash</strong>(분당 약 20회)나 <strong style={{ fontWeight: 600 }}>flash-lite</strong>를 권장합니다. <strong style={{ fontWeight: 600 }}>pro 계열</strong>은 품질이 가장 좋지만 무료 분당 한도가 매우 낮아, 결제가 설정된 키에서 원활합니다. 한도에 걸리면 앱이 자동으로 기다렸다 재시도합니다.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 500, color: 'var(--accent)', flexShrink: 0 };

function optStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex', gap: 11, alignItems: 'flex-start', margin: 0, cursor: 'pointer',
    padding: '13px 15px', borderRadius: 'var(--radius)',
    border: `1px solid ${active ? 'var(--accent-border)' : 'var(--line)'}`,
    background: active ? 'var(--accent-weak)' : 'var(--surface)',
  };
}
