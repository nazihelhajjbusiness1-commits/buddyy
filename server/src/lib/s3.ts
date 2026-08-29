import crypto from 'node:crypto';
import { env } from '../config/env';

/**
 * Minimal, dependency-free S3-compatible client using AWS Signature V4. Works
 * with AWS S3, Cloudflare R2, Backblaze B2, MinIO, etc. Only the two operations
 * the app needs (PUT, DELETE) are implemented. If you outgrow this, drop in
 * @aws-sdk/client-s3 behind the same StorageBackend interface.
 */

interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Custom endpoint (R2/B2/MinIO). Uses path-style. Omit for AWS virtual-host. */
  endpoint?: string;
}

function config(): S3Config {
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error(
      'STORAGE_BACKEND=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
    );
  }
  return {
    bucket: S3_BUCKET,
    region: env.S3_REGION,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    endpoint: env.S3_ENDPOINT,
  };
}

const sha256Hex = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) =>
  crypto.createHmac('sha256', key).update(data).digest();

/** Encode a URL path, preserving slashes between already-safe key segments. */
function encodePath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/** Resolve the request URL + Host header for a given object key. */
function resolve(cfg: S3Config, key: string): { url: string; host: string; canonicalPath: string } {
  if (cfg.endpoint) {
    const u = new URL(cfg.endpoint);
    const canonicalPath = `/${cfg.bucket}/${key}`;
    return { url: `${u.origin}${encodePath(canonicalPath)}`, host: u.host, canonicalPath };
  }
  const host = `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  const canonicalPath = `/${key}`;
  return { url: `https://${host}${encodePath(canonicalPath)}`, host, canonicalPath };
}

async function signedRequest(
  method: 'PUT' | 'DELETE',
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<Response> {
  const cfg = config();
  const { url, host, canonicalPath } = resolve(cfg, key);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders =
    Object.keys(headers)
      .sort()
      .map((h) => `${h}:${headers[h]}\n`)
      .join('') ;

  const canonicalRequest = [
    method,
    encodePath(canonicalPath),
    '', // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method,
    headers: { ...headers, Authorization: authorization },
    body: method === 'PUT' ? body : undefined,
  });
}

export async function s3Put(key: string, body: Buffer, contentType?: string): Promise<void> {
  const res = await signedRequest('PUT', key, body, contentType);
  if (!res.ok) throw new Error(`S3 PUT failed (${res.status}): ${await res.text().catch(() => '')}`);
}

export async function s3Delete(key: string): Promise<void> {
  const res = await signedRequest('DELETE', key, Buffer.alloc(0));
  // S3 returns 204 on delete; treat 404 as already-gone.
  if (!res.ok && res.status !== 404) {
    throw new Error(`S3 DELETE failed (${res.status})`);
  }
}
