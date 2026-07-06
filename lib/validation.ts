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
  if (!names || names.length === 0) return text;
  const labels = ['다른 학생', 'B', 'C', 'D', 'E'];
  let out = text;
  names
    .filter((n) => n && n.trim() !== '')
    .forEach((name, i) => {
      const label = labels[i] ?? `학생${i + 1}`;
      // Replace the name and an optional trailing Korean subject/topic particle.
      const pattern = new RegExp(escapeRegExp(name.trim()) + '(이|가|은|는|을|를|와|과|의|한테|에게|이가)?', 'g');
      out = out.replace(pattern, label);
    });
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
