import { prisma } from '../../lib/prisma';
import { embedder, cosineSimilarity } from '../../lib/embeddings';
import { answer, type ContextBlock } from '../../lib/llm';
import { assertNotebookOwner } from '../notebooks/notebooks.service';

const TOP_K = 6;

const NO_SOURCES_MESSAGE =
  'You have no ready sources selected yet. Upload a document and I can answer from it.';

export interface Citation {
  n: number;
  sourceId: string;
  sourceTitle: string;
  snippet: string;
}

export interface ChatResult {
  answer: string;
  citations: Citation[];
}

export interface Retrieval {
  contexts: ContextBlock[];
  citations: Citation[];
  hasSources: boolean;
}

/**
 * Retrieval step: embed the question and rank chunks from the selected (ready)
 * sources. Shared by the streaming and non-streaming chat paths.
 */
export async function retrieve(
  notebookId: string,
  userId: string,
  question: string,
  sourceIds?: string[],
): Promise<Retrieval> {
  await assertNotebookOwner(notebookId, userId);

  const sources = await prisma.source.findMany({
    where: {
      notebookId,
      status: 'ready',
      ...(sourceIds && sourceIds.length > 0 ? { id: { in: sourceIds } } : {}),
    },
    select: { id: true, title: true },
  });

  if (sources.length === 0) {
    return { contexts: [], citations: [], hasSources: false };
  }

  const titleById = new Map(sources.map((s) => [s.id, s.title]));
  const chunks = await prisma.chunk.findMany({
    where: { sourceId: { in: sources.map((s) => s.id) } },
    select: { sourceId: true, content: true, embedding: true },
  });

  const [queryVec] = await embedder.embed([question], 'query');

  const ranked = chunks
    .map((c) => ({
      sourceId: c.sourceId,
      content: c.content,
      score: cosineSimilarity(queryVec, JSON.parse(c.embedding) as number[]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  const contexts: ContextBlock[] = ranked.map((r, i) => ({
    n: i + 1,
    sourceTitle: titleById.get(r.sourceId) ?? 'Source',
    text: r.content,
  }));

  const citations: Citation[] = ranked.map((r, i) => ({
    n: i + 1,
    sourceId: r.sourceId,
    sourceTitle: titleById.get(r.sourceId) ?? 'Source',
    snippet: r.content.slice(0, 200).trim(),
  }));

  return { contexts, citations, hasSources: true };
}

/** Returns the persisted chat history for a notebook, oldest first. */
export async function listMessages(notebookId: string, userId: string) {
  await assertNotebookOwner(notebookId, userId);
  const messages = await prisma.message.findMany({
    where: { notebookId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, content: true, citations: true, createdAt: true },
  });
  return messages.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    citations: m.citations ? (JSON.parse(m.citations) as Citation[]) : [],
    createdAt: m.createdAt,
  }));
}

/** Persists a user question + assistant answer as a chat turn. */
export async function persistTurn(
  notebookId: string,
  question: string,
  answerText: string,
  citations: Citation[],
): Promise<void> {
  await prisma.$transaction([
    prisma.message.create({ data: { notebookId, role: 'user', content: question } }),
    prisma.message.create({
      data: {
        notebookId,
        role: 'assistant',
        content: answerText,
        citations: JSON.stringify(citations),
      },
    }),
    prisma.notebook.update({ where: { id: notebookId }, data: { updatedAt: new Date() } }),
  ]);
}

export const noSourcesResult = (): ChatResult => ({ answer: NO_SOURCES_MESSAGE, citations: [] });

/** Non-streaming RAG query. */
export async function ask(
  notebookId: string,
  userId: string,
  question: string,
  sourceIds?: string[],
): Promise<ChatResult> {
  const { contexts, citations, hasSources } = await retrieve(notebookId, userId, question, sourceIds);
  if (!hasSources) return noSourcesResult();

  const answerText = await answer(question, contexts);
  await persistTurn(notebookId, question, answerText, citations);
  return { answer: answerText, citations };
}
