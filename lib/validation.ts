import { getCaseType } from '@/lib/caseTypes';
import type { CaseTypeId } from '@/lib/types';

export function validateSlots(
  caseTypeId: CaseTypeId,
  slots: Record<string, string>
): string[] {
  const type = getCaseType(caseTypeId);
  const missing: string[] = [];
  for (const slot of type.slots) {
    if (!slot.required) continue;
    const value = slots[slot.key];
    if (!value || value.trim() === '') missing.push(slot.key);
  }
  return missing;
}

export function maskOtherStudentNames(text: string, names: string[]): string {
  const trimmed = (names ?? []).map((n) => (n ?? '').trim()).filter((n) => n !== '');
  if (trimmed.length === 0) return text;

  // Build a distinct, order-preserving list so labels are assigned by
  // distinct-name index rather than raw array index (fixes label drift
  // when the same name is repeated in the input array).
  const distinctNames: string[] = [];
  for (const name of trimmed) {
    if (!distinctNames.includes(name)) distinctNames.push(name);
  }

  const labels = ['다른 학생', 'B', 'C', 'D', 'E'];
  const labelFor = (i: number) => labels[i] ?? `학생${i + 1}`;

  // Replace longer names first so a shorter name that happens to be a
  // substring of a longer one (e.g. '수' inside '민수') can't corrupt it.
  const order = distinctNames
    .map((name, i) => ({ name, label: labelFor(i) }))
    .sort((a, b) => b.name.length - a.name.length);

  let out = text;
  for (const { name, label } of order) {
    // Replace the bare name only; do not strip any following particle.
    // Removing e.g. '이' after '서연' in '서연이야기' would mangle the
    // unrelated word '이야기', and leaving the particle in place after
    // replacing with '다른 학생' still reads as grammatically correct Korean.
    const pattern = new RegExp(escapeRegExp(name), 'g');
    out = out.replace(pattern, label);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
