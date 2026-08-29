import path from 'node:path';
import { prisma } from '../../lib/prisma';
import { saveBuffer, deleteFile } from '../../lib/storage';
import { extractText } from '../../lib/extract';
import { chunkText } from '../../lib/chunk';
import { embedder } from '../../lib/embeddings';
import { HttpError } from '../../utils/httpError';
import { logger } from '../../lib/logger';
import { assertNotebookOwner } from '../notebooks/notebooks.service';

/** Retry a flaky async op (network embeddings) a few times with backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

const ALLOWED_TYPES = ['lecture', 'book', 'article', 'homework', 'exam', 'other'] as const;
type SourceType = (typeof ALLOWED_TYPES)[number];

function normalizeType(type: string | undefined): SourceType {
  const t = (type ?? '').toLowerCase();
  return (ALLOWED_TYPES as readonly string[]).includes(t) ? (t as SourceType) : 'other';
}

export async function listSources(notebookId: string, userId: string) {
  await assertNotebookOwner(notebookId, userId);
  return prisma.source.findMany({
    where: { notebookId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      type: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
      error: true,
      createdAt: true,
    },
  });
}

export async function createSourceFromUpload(
  notebookId: string,
  userId: string,
  file: Express.Multer.File,
  type: string | undefined,
) {
  await assertNotebookOwner(notebookId, userId);

  const ext = path.extname(file.originalname);
  const { key, size } = await saveBuffer(file.buffer, ext, file.mimetype);

  const source = await prisma.source.create({
    data: {
      notebookId,
      title: file.originalname,
      type: normalizeType(type),
      mimeType: file.mimetype,
      storageKey: key,
      sizeBytes: size,
      status: 'processing',
    },
  });

  // Ingest in the background so the upload returns immediately; the client polls
  // the source status until it becomes "ready" (or "failed"). In production this
  // belongs in a durable job queue (BullMQ/Celery) rather than a fire-and-forget.
  void ingestSource(source.id, file.buffer);

  return source;
}

/** Extract → chunk → embed → store. Updates the source status as it goes. */
export async function ingestSource(sourceId: string, buffer: Buffer): Promise<void> {
  try {
    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) return;

    const text = await extractText(buffer, source.mimeType, source.title);
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      await prisma.source.update({
        where: { id: sourceId },
        data: { status: 'failed', error: 'No extractable text found' },
      });
      return;
    }

    const vectors = await withRetry(() =>
      embedder.embed(
        chunks.map((c) => c.content),
        'document',
      ),
    );

    await prisma.chunk.createMany({
      data: chunks.map((c, i) => ({
        sourceId,
        index: c.index,
        content: c.content,
        embedding: JSON.stringify(vectors[i]),
      })),
    });

    await prisma.source.update({ where: { id: sourceId }, data: { status: 'ready', error: null } });
    logger.info('Source ingested', { sourceId, chunks: chunks.length });
  } catch (err) {
    logger.error('Source ingestion failed', { sourceId, error: (err as Error).message });
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: 'failed', error: (err as Error).message.slice(0, 300) },
    });
  }
}

export async function deleteSource(notebookId: string, sourceId: string, userId: string): Promise<void> {
  await assertNotebookOwner(notebookId, userId);
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source || source.notebookId !== notebookId) {
    throw new HttpError(404, 'Source not found');
  }
  await deleteFile(source.storageKey).catch(() => undefined);
  await prisma.source.delete({ where: { id: sourceId } }); // chunks cascade
}
