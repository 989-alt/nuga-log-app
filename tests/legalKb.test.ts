import { describe, it, expect } from 'vitest';
import { CORE_STATUTES, groundingText } from '@/lib/legalKb';
import { buildSystemPrompt } from '@/lib/prompt';
import raw from '@/data/legal-content.json';

describe('legalKb', () => {
  it('includes the fixed core statutes and both precedents', () => {
    const ids = CORE_STATUTES.map((s) => s.id);
    expect(ids).toContain('gosi_2026_3');
    expect(ids).toContain('elementary_secondary_20_2');
    expect(ids).toContain('child_welfare_17');
    expect(ids).toContain('child_abuse_punishment_2');
    expect(ids).toContain('supreme_2021do13926');
    expect(ids).toContain('supreme_2015do13488');
  });

  it('includes the haeseolseo 2026 update: individual student support, item storage, smart device, guardian duty, teacher-rights response/protection', () => {
    const ids = CORE_STATUTES.map((s) => s.id);
    expect(ids).toContain('individual_student_edu_support');
    expect(ids).toContain('gosi_bulpum_bogwan');
    expect(ids).toContain('gosi_smart_device');
    expect(ids).toContain('guardian_duty_cooperation');
    expect(ids).toContain('teacher_rights_infringement_response');
    expect(ids).toContain('teacher_rights_protection_measures');
  });

  it('elementary_secondary_20_2 gist covers the restraint (제지) requirements, not just the bare grant of authority', () => {
    const item = CORE_STATUTES.find((s) => s.id === 'elementary_secondary_20_2')!;
    expect(item.gist).toContain('방어 및 보호를 위한 제지');
    expect(item.gist).toContain('최소한도');
  });

  it('teacher_rights_protection_measures gist has no [확인필요] marker (report-only annotation, not shipped in JSON)', () => {
    const item = CORE_STATUTES.find((s) => s.id === 'teacher_rights_protection_measures')!;
    expect(item.gist).not.toContain('확인필요');
    expect(item.gist).toContain('소속 교육청 지침 및 교원지위법 원문에 따라 확인한다');
  });

  it('groundingText mentions 고시 5단계 and includes 특수교육 제15조 only when specialEd', () => {
    expect(groundingText(false)).toContain('조언');
    expect(groundingText(false)).not.toContain('제15조');
    expect(groundingText(true)).toContain('제15조');
  });

  it('groundingText includes the new haeseolseo-derived key phrases', () => {
    const text = groundingText(false);
    expect(text).toContain('개별학생교육지원');
    expect(text).toContain('교권보호위원회');
  });

  it('buildSystemPrompt includes the type-7/교권 침해 response-procedure rule', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('지역교권보호위원회');
    expect(p).toContain('피해교원');
  });

  it('data/legal-content.json is valid JSON with well-formed coreStatutes entries', () => {
    const data = raw as { coreStatutes: Array<{ id: string; title: string; scope: string; gist: string; kind: string }> };
    expect(Array.isArray(data.coreStatutes)).toBe(true);
    for (const s of data.coreStatutes) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.title).toBe('string');
      expect(typeof s.scope).toBe('string');
      expect(typeof s.gist).toBe('string');
      expect(['statute', 'decision']).toContain(s.kind);
    }
    const ids = data.coreStatutes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
