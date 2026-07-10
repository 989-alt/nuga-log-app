import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supportsDirectorySave, saveViaPicker, downloadText } from '@/lib/fileSave';

describe('fileSave', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('supportsDirectorySave reflects showSaveFilePicker presence', () => {
    (globalThis as any).window = {};
    expect(supportsDirectorySave()).toBe(false);
    (globalThis as any).window = { showSaveFilePicker: () => {} };
    expect(supportsDirectorySave()).toBe(true);
  });

  it('saveViaPicker returns unsupported when API missing', async () => {
    (globalThis as any).window = {};
    expect(await saveViaPicker('a.txt', 'x')).toBe('unsupported');
  });

  it('saveViaPicker returns cancelled when the user aborts', async () => {
    const abort = Object.assign(new Error('abort'), { name: 'AbortError' });
    (globalThis as any).window = { showSaveFilePicker: vi.fn().mockRejectedValue(abort) };
    expect(await saveViaPicker('a.txt', 'x')).toBe('cancelled');
  });

  it('saveViaPicker writes and closes on success', async () => {
    const write = vi.fn(); const close = vi.fn();
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    (globalThis as any).window = { showSaveFilePicker: vi.fn().mockResolvedValue({ createWritable }) };
    expect(await saveViaPicker('a.txt', 'hello')).toBe('saved');
    expect(write).toHaveBeenCalledWith('hello');
    expect(close).toHaveBeenCalled();
  });
});
