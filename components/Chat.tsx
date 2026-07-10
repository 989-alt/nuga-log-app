'use client';
import { useRef, useState } from 'react';
import type { AiConfig, ChatTurnResponse, GenerateResult, SpecialEdInfo, ThinkingLevel } from '@/lib/types';
import { initialChatState, withUserMessage, withTurnResponse, type ChatState } from '@/lib/chatState';
import { getCaseType } from '@/lib/caseTypes';
import ApiKeyPanel from '@/components/ApiKeyPanel';
import SpecialEdPanel from '@/components/SpecialEdPanel';
import ChatThread from '@/components/ChatThread';
import ResultBlocks from '@/components/ResultBlocks';
import QuickReplies from '@/components/QuickReplies';
import { addHistory, makeId } from '@/lib/history';

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
export default function Chat() {
  const [ai, setAi] = useState<AiConfig>({ mode: 'byok' });
  const [specialEd, setSpecialEd] = useState<SpecialEdInfo>({ isSpecialEd: false, disabilities: [] });
  const [chatState, setChatState] = useState<ChatState>(initialChatState);
  const [input, setInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfterSec, setRetryAfterSec] = useState<number | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const stateRef = useRef(chatState);
  stateRef.current = chatState;

  const defaultThinking: ThinkingLevel =
    chatState.caseTypeId && getCaseType(chatState.caseTypeId).highRisk ? 'dynamic' : 'off';

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
          specialEd,
          ai,
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
    if (!text || chatBusy || genBusy) return;
    setInput('');
    sendPreset(text);
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
        body: JSON.stringify({ caseTypeId: chatState.caseTypeId, slots: chatState.slots, specialEd, ai }),
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
      });
    } catch {
      setGenError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <ApiKeyPanel onChange={setAi} defaultThinking={defaultThinking} />
      <SpecialEdPanel value={specialEd} onChange={setSpecialEd} />

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

        <div style={{ borderTop: '1px solid var(--line)', padding: 16, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
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
          <button type="button" className="btn btn-primary" disabled={chatBusy || genBusy || !input.trim()} onClick={handleSend}>
            {chatBusy ? <span className="spinner" aria-hidden /> : '전송'}
          </button>
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
        <ResultBlocks result={result} context={{ caseTypeId: chatState.caseTypeId, slots: chatState.slots, specialEd }} />
      )}
    </div>
  );
}
