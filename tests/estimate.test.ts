import { describe, it, expect } from 'vitest';
import { estimateSeconds, formatEstimate } from '@/lib/estimate';

// 근거: 설계 문서 실측(gemini-2.5-flash) off≈3s, light≈5s, dynamic≈11~14s, 정밀=2회 순차.
describe('estimateSeconds', () => {
  it('gemini off (속도 우선) ≈ 3s for a single call', () => {
    expect(estimateSeconds({ mode: 'free', thinkingLevel: 'off' }, false)).toBe(3);
  });

  it('gemini light (균형) ≈ 5s', () => {
    expect(estimateSeconds({ mode: 'free', thinkingLevel: 'light' }, false)).toBe(5);
  });

  it('gemini dynamic (품질 우선) ≈ 13s', () => {
    expect(estimateSeconds({ mode: 'free', thinkingLevel: 'dynamic' }, false)).toBe(13);
  });

  it('unset thinking level assumes dynamic (앱 기본 추론)', () => {
    expect(estimateSeconds({ mode: 'free' }, false)).toBe(13);
  });

  it('정밀 모드 doubles the estimate (2단계 순차 호출)', () => {
    expect(estimateSeconds({ mode: 'free', thinkingLevel: 'dynamic' }, true)).toBe(26);
  });

  it('non-gemini providers use a generic per-call estimate', () => {
    expect(estimateSeconds({ mode: 'byok', provider: 'claude', apiKey: 'K', model: 'x' }, false)).toBe(8);
    expect(estimateSeconds({ mode: 'byok', provider: 'openai', apiKey: 'K', model: 'x' }, true)).toBe(16);
  });
});

describe('formatEstimate', () => {
  it('shows small values exactly', () => {
    expect(formatEstimate(3)).toBe('약 3초');
  });

  it('rounds larger values to the nearest 5s', () => {
    expect(formatEstimate(13)).toBe('약 15초');
    expect(formatEstimate(26)).toBe('약 25초');
  });
});
