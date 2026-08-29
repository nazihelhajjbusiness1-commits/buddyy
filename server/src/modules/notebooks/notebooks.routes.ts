import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth';
import { env } from '../../config/env';
import * as c from './notebooks.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
});

export const notebooksRouter = Router();

notebooksRouter.use(requireAuth);

// Notebooks
notebooksRouter.post('/', c.createNotebookHandler);
notebooksRouter.get('/', c.listNotebooksHandler);
notebooksRouter.get('/:id', c.getNotebookHandler);
notebooksRouter.patch('/:id', c.renameNotebookHandler);
notebooksRouter.delete('/:id', c.deleteNotebookHandler);
notebooksRouter.get('/:id/messages', c.listMessagesHandler);

// Sources (nested under a notebook)
notebooksRouter.get('/:id/sources', c.listSourcesHandler);
notebooksRouter.post('/:id/sources', upload.single('file'), c.uploadSourceHandler);
notebooksRouter.delete('/:id/sources/:sourceId', c.deleteSourceHandler);

// Chat
notebooksRouter.post('/:id/chat', c.chatHandler);
notebooksRouter.post('/:id/chat/stream', c.chatStreamHandler);
