export interface TextChunk {
  index: number;
  content: string;
}

/**
 * Removes unpaired UTF-16 surrogates. Slicing text by code-unit index (below)
 * can cut a surrogate pair in half at a chunk boundary, leaving a lone high or
 * low surrogate. Those aren't valid Unicode scalar values, so Prisma/SQLite
 * refuses to store them ("lone leading surrogate in hex escape") and the whole
 * ingest fails. Strip any that a slice may have orphaned.
 */
function stripLoneSurrogates(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
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

    const content = stripLoneSurrogates(clean.slice(start, end).trim());
    if (content) chunks.push({ index: index++, content });

    if (end >= clean.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}
