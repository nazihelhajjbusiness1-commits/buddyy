import * as mammoth from 'mammoth';
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';
import { HttpError } from '../utils/httpError';

const NUL = String.fromCharCode(0);

/** Extracts plain text from an uploaded file buffer based on its type. */
export async function extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const name = filename.toLowerCase();

  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  }

  if (mimeType.includes('word') || name.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimeType.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
    return buffer.toString('utf8');
  }

  // Last resort: treat as UTF-8 text unless it looks binary (contains NUL bytes).
  const asText = buffer.toString('utf8');
  if (asText.includes(NUL)) {
    throw new HttpError(415, `Unsupported file type: ${mimeType || filename}`);
  }
  return asText;
}
