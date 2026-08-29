import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { s3Put, s3Delete } from './s3';

/**
 * Pluggable file storage. `STORAGE_BACKEND=local` (default) writes to disk for
 * development; `STORAGE_BACKEND=s3` uses any S3-compatible bucket (AWS S3,
 * Cloudflare R2, Backblaze B2). The rest of the app only depends on the exported
 * functions, never on where the bytes actually live.
 */
interface StorageBackend {
  ensure(): Promise<void>;
  save(buffer: Buffer, ext: string, contentType?: string): Promise<{ key: string; size: number }>;
  remove(key: string): Promise<void>;
}

function newKey(ext: string): string {
  const suffix = ext ? (ext.startsWith('.') ? ext : `.${ext}`) : '';
  return `${crypto.randomUUID()}${suffix}`;
}

/* ------------------------------- Local disk ------------------------------- */
const dir = path.resolve(env.UPLOAD_DIR);

const localBackend: StorageBackend = {
  async ensure() {
    await fs.mkdir(dir, { recursive: true });
  },
  async save(buffer, ext) {
    const key = newKey(ext);
    await fs.writeFile(path.join(dir, key), buffer);
    return { key, size: buffer.length };
  },
  async remove(key) {
    await fs.rm(path.join(dir, key), { force: true });
  },
};

/* --------------------------------- S3/R2 ---------------------------------- */
const s3Backend: StorageBackend = {
  async ensure() {
    // Bucket is expected to exist already; nothing to create at boot.
  },
  async save(buffer, ext, contentType) {
    const key = newKey(ext);
    await s3Put(key, buffer, contentType);
    return { key, size: buffer.length };
  },
  async remove(key) {
    await s3Delete(key);
  },
};

const backend: StorageBackend = env.STORAGE_BACKEND === 's3' ? s3Backend : localBackend;

export const ensureStorage = () => backend.ensure();

export const saveBuffer = (buffer: Buffer, ext: string, contentType?: string) =>
  backend.save(buffer, ext, contentType);

export const deleteFile = (key: string) => backend.remove(key);
