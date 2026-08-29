import { describe, it, expect } from 'vitest';
import { cosineSimilarity, embedder } from '../src/lib/embeddings';

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and 0 for orthogonal ones', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 on dimension mismatch and 0 for a zero vector', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(-1);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('dev embedder', () => {
  it('is deterministic and ranks lexical overlap highest', async () => {
    const [a1] = await embedder.embed(['photosynthesis in plants'], 'document');
    const [a2] = await embedder.embed(['photosynthesis in plants'], 'document');
    expect(a1).toEqual(a2); // deterministic

    const [q] = await embedder.embed(['how does photosynthesis work'], 'query');
    const related = cosineSimilarity(q, a1);
    const [unrelated] = await embedder.embed(['quarterly tax accounting rules'], 'document');
    expect(related).toBeGreaterThan(cosineSimilarity(q, unrelated));
  });
});
