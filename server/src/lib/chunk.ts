export interface TextChunk {
  index: number;
  content: string;
}

/**
 * Splits text into overlapping chunks, preferring paragraph/sentence boundaries
 * near the target size so chunks stay semantically coherent.
 */
export function chunkText(text: string, size = 1000, overlap = 150): TextChunk[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!clean) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);

    if (end < clean.length) {
      const slice = clean.slice(start, end);
      const boundary = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
      if (boundary > size * 0.5) end = start + boundary + 1;
    }

    const content = clean.slice(start, end).trim();
    if (content) chunks.push({ index: index++, content });

    if (end >= clean.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}
