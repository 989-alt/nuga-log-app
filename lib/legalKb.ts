import raw from '@/data/legal-content.json';

export interface CoreStatute {
  id: string;
  title: string;
  scope: string;
  gist: string;
  kind: 'statute' | 'decision';
}

export const CORE_STATUTES: CoreStatute[] = (raw as any).coreStatutes as CoreStatute[];

export function groundingText(): string {
  const lines: string[] = ['핵심 근거(항상 참고):'];
  for (const s of CORE_STATUTES) {
    if (s.id === 'gosi_2026_3') {
      lines.push(`- ${s.title}: 지도를 조언·상담·주의·훈육·훈계 5단계로 구분한 고시.`);
      continue;
    }
    lines.push(`- ${s.title}: ${s.scope}. ${s.gist}`);
  }
  return lines.join('\n');
}
