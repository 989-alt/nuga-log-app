'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AiConfig, AiProvider, ChatTurnResponse, FollowUpContext, GenerateResult, ThinkingLevel } from '@/lib/types';
import { initialChatState, withUserMessage, withTurnResponse, type ChatState } from '@/lib/chatState';
import { getCaseType } from '@/lib/caseTypes';
import { scanIdentifiers, maskIdentifiers, scanSensitive, summarizeCategories } from '@/lib/piiScan';
import ApiKeyPanel from '@/components/ApiKeyPanel';
import ChatThread from '@/components/ChatThread';
import ResultBlocks from '@/components/ResultBlocks';
import QuickReplies from '@/components/QuickReplies';
import { addHistory, makeId, type HistoryItem } from '@/lib/history';

/** "YYYY-MM-DD" → "M월 D일". */
function formatMonthDay(isoDate: string): string {
  const [, m, d] = isoDate.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

const PROVIDER_LABEL: Record<AiProvider, string> = {
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude',
  openai: 'OpenAI',
};

/** 전송 고지에 쓸 외부 AI 제공자 이름 */
function providerLabel(ai: AiConfig): string {
  const p = ai.provider as AiProvider | undefined;
  return p ? PROVIDER_LABEL[p] ?? '외부 AI' : '외부 AI';
}

function followUpContextOf(item: HistoryItem): FollowUpContext {
  return {
    parentId: item.id,
    parentDate: item.date,
    caseTypeId: item.caseTypeId,
    parentBody: item.result.body,
  };
}

/** 응답 본문을 JSON으로 해석하지 못했을 때(예: 504/502 게이트웨이 타임아웃이 HTML/빈
 *  본문을 돌려주는 경우) 보여줄 문구. res.ok 여부와 무관하게 "해석 실패"는 별도 문구다. */
function unreadableResponseMessage(status: number): string {
  if (status === 504 || status === 502) {
    return '서버 처리 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.';
  }
  return `서버 응답을 해석하지 못했습니다(상태 ${status}). 다시 시도해 주세요.`;
}

/**
 * 챗 UI 컨테이너. 대화(transcript)는 이 컴포넌트 상태(메모리)에만 존재하고,
 * 새로고침하면 사라진다 — localStorage에는 최종 누가기록(addHistory)만 저장한다.
 */
export default function Chat({
  followUpTarget = null,
  onDone,
  onSaved,
}: {
  followUpTarget?: HistoryItem | null;
  onDone?: () => void;
  onSaved?: () => void;
} = {}) {
  const [ai, setAi] = useState<AiConfig>({ mode: 'byok' });
  const [chatState, setChatState] = useState<ChatState>(initialChatState);
  const [input, setInput] = useState('');
  // 이름(저신뢰) 오탐일 때만 교사가 "그대로 전송"으로 해제할 수 있는 예외 플래그.
  // 입력이 바뀌면 다시 잠긴다.
  const [overrideLowRisk, setOverrideLowRisk] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfterSec, setRetryAfterSec] = useState<number | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const stateRef = useRef(chatState);
  stateRef.current = chatState;

  const prevFollowUpId = useRef<string | null>(null);

  // followUpTarget이 설정/해제될 때만 챗을 리셋한다(같은 항목이 다시 선택돼도 재트리거되도록
  // id 변화만 감시). "취소"로 null이 되면 처음 상태로 되돌아간다.
  useEffect(() => {
    const currentId = followUpTarget?.id ?? null;
    if (currentId === prevFollowUpId.current) return;
    prevFollowUpId.current = currentId;

    if (followUpTarget) {
      const type = getCaseType(followUpTarget.caseTypeId);
      setChatState({
        messages: [
          {
            role: 'assistant',
            content: `${formatMonthDay(followUpTarget.date)} '${type.name}' 기록의 후속 기록이군요. 어떤 절차를 밟으셨나요? (예: 보호자 통보 완료, 상담 실시, 협의회 개최, 재관찰 결과, 전문기관 연계)`,
          },
        ],
        slots: {},
        caseTypeId: followUpTarget.caseTypeId,
        readyToGenerate: false,
      });
    } else {
      setChatState(initialChatState);
    }
    setResult(null);
    setGenError(null);
    setError(null);
    setRetryAfterSec(null);
  }, [followUpTarget]);

  const defaultThinking: ThinkingLevel =
    chatState.caseTypeId && getCaseType(chatState.caseTypeId).highRisk ? 'dynamic' : 'off';

  // 입력이 바뀔 때마다 식별정보·민감정보를 재검사한다(전송 전 클라이언트 검사).
  const idHits = useMemo(() => scanIdentifiers(input), [input]);
  const sensitiveHits = useMemo(() => scanSensitive(input), [input]);
  const highHits = idHits.filter((h) => h.confidence === 'high');
  const lowHits = idHits.filter((h) => h.confidence === 'low');
  // 남은 게 저신뢰(이름 추정)뿐일 때만 예외 전송 허용
  const onlyLowRisk = idHits.length > 0 && highHits.length === 0;
  const blockedByPii = idHits.length > 0 && !(onlyLowRisk && overrideLowRisk);

  // 입력이 바뀌면 예외 플래그를 재설정해 매 편집마다 다시 검사되게 한다.
  useEffect(() => {
    setOverrideLowRisk(false);
  }, [input]);

  async function sendTurn(nextState: ChatState) {
    setChatBusy(true);
    setError(null);
    setRetryAfterSec(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextState.messages,
          slots: nextState.slots,
          caseTypeId: nextState.caseTypeId,
          ai,
          ...(followUpTarget ? { followUp: followUpContextOf(followUpTarget) } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (data === null) {
        setError(unreadableResponseMessage(res.status));
        return;
      }
      if (!res.ok) {
        if (res.status === 429) setRetryAfterSec(Math.min(Math.max(Number(data.retryAfterSec) || 30, 1), 90));
        setError(data.error ?? '대화 처리 중 오류가 발생했습니다.');
        return;
      }
      setChatState(withTurnResponse(nextState, data as ChatTurnResponse));
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setChatBusy(false);
    }
  }

  /** 입력창을 거치지 않고 고정 문구를 사용자 턴으로 바로 전송한다(퀵리플라이용). */
  function sendPreset(text: string) {
    if (!text || chatBusy || genBusy) return;
    const next = withUserMessage(chatState, text);
    setChatState(next);
    void sendTurn(next);
  }

  function handleSend() {
    const text = input.trim();
    if (!text || chatBusy || genBusy || blockedByPii) return;
    setInput('');
    sendPreset(text);
  }

  /** 감지된 식별정보를 한 번에 마스킹해 입력창에 되돌려 넣는다(교사가 확인 후 전송). */
  function maskInput() {
    setInput((prev) => maskIdentifiers(prev, scanIdentifiers(prev)));
    setOverrideLowRisk(false);
  }

  function retryChat() {
    setRetryAfterSec(null);
    void sendTurn(stateRef.current);
  }

  async function handleGenerate() {
    if (genBusy || chatBusy || !chatState.caseTypeId) return;
    setGenBusy(true);
    setGenError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseTypeId: chatState.caseTypeId,
          slots: chatState.slots,
          ai,
          ...(followUpTarget ? { followUp: followUpContextOf(followUpTarget) } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (data === null) {
        setGenError(unreadableResponseMessage(res.status));
        return;
      }
      if (!res.ok) {
        if (res.status === 429) {
          const when = data.retryAfterSec ? `약 ${data.retryAfterSec}초 뒤` : '잠시 후';
          setGenError(`${data.error ?? '요청 한도에 도달했습니다.'} (${when} 다시 시도해 주세요.)`);
        } else {
          setGenError(data.error ?? '생성에 실패했습니다.');
        }
        return;
      }
      const generated = data as GenerateResult;
      setResult(generated);
      setChatState((s) => ({
        ...s,
        messages: [...s.messages, { role: 'assistant', content: '초안을 만들었어요. 아래에서 확인하고 복사·저장해 주세요.' }],
      }));
      addHistory({
        id: makeId(JSON.stringify(chatState.slots) + chatState.caseTypeId + Date.now()),
        date: new Date().toISOString().slice(0, 10),
        caseTypeId: chatState.caseTypeId,
        result: generated,
        ...(followUpTarget ? { parentId: followUpTarget.id } : {}),
      });
      onSaved?.();
    } catch {
      setGenError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <ApiKeyPanel onChange={setAi} defaultThinking={defaultThinking} />

      {followUpTarget && (
        <div className="callout callout-info" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              후속 기록 작성 중 — {formatMonthDay(followUpTarget.date)} · {getCaseType(followUpTarget.caseTypeId).name}
            </div>
            <div style={{ fontSize: 13.5, opacity: 0.85 }}>
              {followUpTarget.result.body.length > 60
                ? followUpTarget.result.body.slice(0, 60) + '…'
                : followUpTarget.result.body}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '8px 14px', fontSize: 13, flexShrink: 0 }}
            onClick={() => onDone?.()}
          >
            취소
          </button>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <ChatThread messages={chatState.messages} typing={chatBusy ? 'chat' : genBusy ? 'generate' : null} />

        {chatState.readyToGenerate && chatState.caseTypeId && !result && !chatBusy && !genBusy && (
          <div style={{ padding: '0 20px 16px' }}>
            <QuickReplies
              options={[
                { label: '네, 초안을 만들어 주세요', variant: 'primary', onSelect: handleGenerate },
                { label: '아니오, 추가할 내용이 있어요', variant: 'ghost', onSelect: () => sendPreset('추가하거나 수정할 내용이 있어요.') },
              ]}
            />
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--line)', padding: 16, display: 'grid', gap: 12 }}>
          {idHits.length > 0 && (
            <div className={blockedByPii ? 'callout callout-danger' : 'callout callout-warning'} style={{ margin: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {blockedByPii ? '⚠ 식별정보가 있어 전송을 멈췄어요' : '식별정보를 가린 상태로 전송합니다'}
              </div>
              <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.55, color: 'inherit' }}>
                이름·학교·학년·반·번호 등은 이름을 빼도 특정 개인을 알아볼 수 있어(개인정보 보호법 제2조) 외부 AI로
                보내지 않는 것이 안전합니다. 감지된 항목: <strong style={{ fontWeight: 600 }}>{summarizeCategories(idHits).join(', ')}</strong>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <button type="button" className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 13 }} onClick={maskInput} disabled={chatBusy || genBusy}>
                  자동으로 가리기
                </button>
                {onlyLowRisk && !overrideLowRisk && (
                  <button
                    type="button"
                    onClick={() => setOverrideLowRisk(true)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 12.5, color: 'inherit', opacity: 0.75, textDecoration: 'underline' }}
                  >
                    감지된 표현은 이름이 아니에요 · 그대로 전송
                  </button>
                )}
              </div>
            </div>
          )}

          {sensitiveHits.length > 0 && (
            <div className="callout callout-warning" style={{ margin: 0 }}>
              <div style={{ fontWeight: 600 }}>민감정보가 포함된 것 같아요</div>
              <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.55, color: 'inherit' }}>
                {sensitiveHits.map((h) => h.category).join(', ')} 관련 내용은 이름을 지워도 신중히 다뤄야 하는
                민감정보입니다(개인정보 보호법 제23조). 외부 AI에는 지도에 꼭 필요한 최소한만 적어 주세요.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="있었던 일을 자유롭게 적어 주세요"
              disabled={chatBusy || genBusy}
              style={{ flex: 1, minHeight: 52, wordBreak: 'keep-all' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button type="button" className="btn btn-primary" disabled={chatBusy || genBusy || !input.trim() || blockedByPii} onClick={handleSend}>
              {chatBusy ? <span className="spinner" aria-hidden /> : '전송'}
            </button>
          </div>

          <p className="help" style={{ margin: 0 }}>
            입력 내용은 <strong style={{ fontWeight: 600 }}>{providerLabel(ai)}</strong>(외부 AI)로 전송·처리됩니다.
            이름·학번·반·학교 등 식별정보는 넣지 마세요. 이 앱은 서버에 저장·기록하지 않으며 결과는 이 브라우저에만 남습니다.
          </p>
        </div>
      </div>

      {error && (
        <div className="callout callout-danger">
          <div>{error}</div>
          <button type="button" className="btn btn-ghost" style={{ marginTop: 10, padding: '8px 14px', fontSize: 13 }} onClick={retryChat} disabled={chatBusy}>
            다시 시도{retryAfterSec ? ` (약 ${retryAfterSec}초 후 권장)` : ''}
          </button>
        </div>
      )}

      {genError && (
        <div className="callout callout-danger">
          <div>{genError}</div>
          <button type="button" className="btn btn-ghost" style={{ marginTop: 10, padding: '8px 14px', fontSize: 13 }} onClick={handleGenerate} disabled={genBusy}>
            다시 시도
          </button>
        </div>
      )}

      {result && chatState.caseTypeId && (
        <ResultBlocks result={result} context={{ caseTypeId: chatState.caseTypeId, slots: chatState.slots }} />
      )}
    </div>
  );
}
