import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { ensureStorage } from './lib/storage';
import { logger } from './lib/logger';
import { initSentry } from './lib/sentry';

initSentry();

const app = createApp();

// Make sure the storage backend is ready before we start accepting files.
void ensureStorage();

const server = app.listen(env.PORT, () => {
  logger.info('Buddyy API listening', {
    url: `http://localhost:${env.PORT}`,
    env: env.NODE_ENV,
    storage: env.STORAGE_BACKEND,
  });
});

async function shutdown(signal: string) {
  logger.info('Shutting down', { signal });
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
