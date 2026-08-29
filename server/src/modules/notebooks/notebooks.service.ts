import type { Notebook } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { deleteFile } from '../../lib/storage';
import { HttpError } from '../../utils/httpError';

/** Loads a notebook and verifies it belongs to the user, else 404. */
export async function assertNotebookOwner(notebookId: string, userId: string): Promise<Notebook> {
  const notebook = await prisma.notebook.findUnique({ where: { id: notebookId } });
  if (!notebook || notebook.userId !== userId) {
    throw new HttpError(404, 'Notebook not found');
  }
  return notebook;
}

export function createNotebook(userId: string, title?: string) {
  return prisma.notebook.create({
    data: { userId, title: title?.trim() || 'Untitled notebook' },
  });
}

export function listNotebooks(userId: string) {
  return prisma.notebook.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { sources: true } } },
  });
}

export async function getNotebook(notebookId: string, userId: string) {
  await assertNotebookOwner(notebookId, userId);
  return prisma.notebook.findUnique({
    where: { id: notebookId },
    include: { sources: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function renameNotebook(notebookId: string, userId: string, title: string) {
  await assertNotebookOwner(notebookId, userId);
  return prisma.notebook.update({ where: { id: notebookId }, data: { title: title.trim() } });
}

export async function deleteNotebook(notebookId: string, userId: string): Promise<void> {
  await assertNotebookOwner(notebookId, userId);
  const sources = await prisma.source.findMany({ where: { notebookId }, select: { storageKey: true } });
  await Promise.all(sources.map((s) => deleteFile(s.storageKey).catch(() => undefined)));
  await prisma.notebook.delete({ where: { id: notebookId } });
}
