export function supportsDirectorySave(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showSaveFilePicker === 'function';
}

/** File System Access API로 저장. 최초 1회 위치를 고르면 브라우저가 기억한다. */
export async function saveViaPicker(
  filename: string,
  text: string
): Promise<'saved' | 'cancelled' | 'unsupported'> {
  if (!supportsDirectorySave()) return 'unsupported';
  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: '텍스트 파일', accept: { 'text/plain': ['.txt'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return 'saved';
  } catch (e: any) {
    if (e && e.name === 'AbortError') return 'cancelled';
    throw e;
  }
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
