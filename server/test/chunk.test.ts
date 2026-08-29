import { describe, it, expect } from 'vitest';
import { chunkText } from '../src/lib/chunk';

describe('chunkText', () => {
  it('returns nothing for empty/whitespace input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\t  ')).toEqual([]);
  });

  it('keeps short text as a single chunk', () => {
    const chunks = chunkText('A short lecture note.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ index: 0, content: 'A short lecture note.' });
  });

  it('splits long text into overlapping, sequentially-indexed chunks', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} here.`).join(' ');
    const chunks = chunkText(text, 200, 40);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.index).toBe(i));
    // Every chunk should carry content.
    expect(chunks.every((c) => c.content.length > 0)).toBe(true);
  });
});
