import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { HttpError } from '../../utils/httpError';
import { answerStream } from '../../lib/llm';
import * as notebooks from './notebooks.service';
import * as sources from '../sources/sources.service';
import * as chat from '../chat/chat.service';

const createSchema = z.object({ title: z.string().trim().max(120).optional() });
const renameSchema = z.object({ title: z.string().trim().min(1).max(120) });
const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  sourceIds: z.array(z.string()).optional(),
});
const uploadTypeSchema = z.object({ type: z.string().optional() });

/* ------------------------------ Notebooks ------------------------- */
export const createNotebookHandler = asyncHandler(async (req, res) => {
  const { title } = createSchema.parse(req.body);
  const notebook = await notebooks.createNotebook(req.user!.id, title);
  res.status(201).json({ notebook });
});

export const listNotebooksHandler = asyncHandler(async (req, res) => {
  res.json({ notebooks: await notebooks.listNotebooks(req.user!.id) });
});

export const getNotebookHandler = asyncHandler(async (req, res) => {
  res.json({ notebook: await notebooks.getNotebook(req.params.id, req.user!.id) });
});

export const renameNotebookHandler = asyncHandler(async (req, res) => {
  const { title } = renameSchema.parse(req.body);
  const notebook = await notebooks.renameNotebook(req.params.id, req.user!.id, title);
  res.json({ notebook });
});

export const deleteNotebookHandler = asyncHandler(async (req, res) => {
  await notebooks.deleteNotebook(req.params.id, req.user!.id);
  res.json({ message: 'Notebook deleted' });
});

export const listMessagesHandler = asyncHandler(async (req, res) => {
  res.json({ messages: await chat.listMessages(req.params.id, req.user!.id) });
});

/* ------------------------------- Sources -------------------------- */
export const listSourcesHandler = asyncHandler(async (req, res) => {
  res.json({ sources: await sources.listSources(req.params.id, req.user!.id) });
});

export const uploadSourceHandler = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded (field name must be "file")');
  const { type } = uploadTypeSchema.parse(req.body);
  const source = await sources.createSourceFromUpload(req.params.id, req.user!.id, req.file, type);
  res.status(201).json({ source });
});

export const deleteSourceHandler = asyncHandler(async (req, res) => {
  await sources.deleteSource(req.params.id, req.params.sourceId, req.user!.id);
  res.json({ message: 'Source deleted' });
});

/* -------------------------------- Chat ---------------------------- */
export const chatHandler = asyncHandler(async (req, res) => {
  const { message, sourceIds } = chatSchema.parse(req.body);
  const result = await chat.ask(req.params.id, req.user!.id, message, sourceIds);
  res.json(result);
});

/** Server-Sent Events streaming chat: citations first, then answer deltas. */
export const chatStreamHandler = asyncHandler(async (req: Request, res: Response) => {
  const { message, sourceIds } = chatSchema.parse(req.body);
  const notebookId = req.params.id;
  const userId = req.user!.id;

  const { contexts, citations, hasSources } = await chat.retrieve(
    notebookId,
    userId,
    message,
    sourceIds,
  );

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  const send = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  if (!hasSources) {
    const { answer } = chat.noSourcesResult();
    send('citations', []);
    send('delta', { text: answer });
    send('done', {});
    res.end();
    return;
  }

  send('citations', citations);

  let full = '';
  try {
    for await (const chunk of answerStream(message, contexts)) {
      full += chunk;
      send('delta', { text: chunk });
    }
  } catch (err) {
    send('error', { message: (err as Error).message });
  }

  if (full.trim()) await chat.persistTurn(notebookId, message, full, citations);
  send('done', {});
  res.end();
});
