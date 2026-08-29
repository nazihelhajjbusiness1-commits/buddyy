/* ------------------------------------------------------------------ *
 * Typed client for the Buddyy auth API.
 *
 * - The access token lives in memory only (never localStorage) and is
 *   attached as a Bearer header on authenticated calls.
 * - The refresh token is an HttpOnly cookie the browser sends automatically
 *   because every request uses `credentials: 'include'`.
 * - On a 401 from an authenticated call we transparently try one refresh
 *   and replay the request.
 * ------------------------------------------------------------------ */

// Relative by default → same-origin as the app; the Vite dev server proxies
// "/api" to the backend (see vite.config.ts). Override with VITE_API_BASE if the
// API lives on a different host in production.
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: string;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

let accessToken: string | null = null;
export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};
export const getAccessToken = (): string | null => accessToken;

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Multipart form body (e.g. file upload). Sent as-is; no JSON Content-Type. */
  form?: FormData;
  /** Attach the Bearer token and auto-refresh on 401. */
  auth?: boolean;
  _retried?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!opts.form) headers['Content-Type'] = 'application/json';
  if (opts.auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });

  // One transparent refresh + replay for expired access tokens.
  if (res.status === 401 && opts.auth && !opts._retried) {
    try {
      await refresh();
    } catch {
      throw new ApiError(401, 'Session expired');
    }
    return request<T>(path, { ...opts, _retried: true });
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (data && (data.error as string)) || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, data?.details);
  }

  return data as T;
}

/* ------------------------------ Auth API -------------------------- */

export interface RegisterBody {
  email: string;
  password: string;
  name?: string;
}

export interface MessageResponse {
  message: string;
}

export const register = (body: RegisterBody) =>
  request<MessageResponse>('/auth/register', { method: 'POST', body });

export const verifyEmail = (token: string) =>
  request<MessageResponse>('/auth/verify-email', { method: 'POST', body: { token } });

export async function login(email: string, password: string) {
  const res = await request<{ accessToken: string; user: PublicUser }>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  setAccessToken(res.accessToken);
  return res;
}

// Function declaration (hoisted) so `request` above can call it.
export async function refresh() {
  const res = await request<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
  setAccessToken(res.accessToken);
  return res;
}

export async function logout() {
  try {
    await request<MessageResponse>('/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
  }
}

export const forgotPassword = (email: string) =>
  request<MessageResponse>('/auth/forgot-password', { method: 'POST', body: { email } });

export const resetPassword = (token: string, password: string) =>
  request<MessageResponse>('/auth/reset-password', { method: 'POST', body: { token, password } });

export const getMe = () => request<{ user: PublicUser }>('/auth/me', { auth: true });

/**
 * Restores a session on page load: exchanges the HttpOnly refresh cookie for a
 * fresh access token, then loads the user. Returns null if not authenticated.
 */
export async function ensureSession(): Promise<PublicUser | null> {
  try {
    await refresh();
    const { user } = await getMe();
    return user;
  } catch {
    return null;
  }
}

/* --------------------------- Notebooks & RAG ---------------------- */

export interface Notebook {
  id: string;
  title: string;
  createdAt?: string;
  _count?: { sources: number };
}

export interface SourceItem {
  id: string;
  title: string;
  type: string;
  mimeType: string;
  sizeBytes: number;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  createdAt: string;
}

export interface Citation {
  n: number;
  sourceId: string;
  sourceTitle: string;
  snippet: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
}

export interface HistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  createdAt: string;
}

export const listNotebooks = () => request<{ notebooks: Notebook[] }>('/notebooks', { auth: true });

export const createNotebook = (title: string) =>
  request<{ notebook: Notebook }>('/notebooks', { method: 'POST', body: { title }, auth: true });

export const renameNotebook = (notebookId: string, title: string) =>
  request<{ notebook: Notebook }>(`/notebooks/${notebookId}`, {
    method: 'PATCH',
    body: { title },
    auth: true,
  });

export const deleteNotebook = (notebookId: string) =>
  request<{ message: string }>(`/notebooks/${notebookId}`, { method: 'DELETE', auth: true });

export const listMessages = (notebookId: string) =>
  request<{ messages: HistoryMessage[] }>(`/notebooks/${notebookId}/messages`, { auth: true });

export const listSources = (notebookId: string) =>
  request<{ sources: SourceItem[] }>(`/notebooks/${notebookId}/sources`, { auth: true });

export function uploadSource(notebookId: string, file: File, type: string) {
  const form = new FormData();
  form.append('type', type);
  form.append('file', file);
  return request<{ source: SourceItem }>(`/notebooks/${notebookId}/sources`, {
    method: 'POST',
    form,
    auth: true,
  });
}

export const deleteSource = (notebookId: string, sourceId: string) =>
  request<{ message: string }>(`/notebooks/${notebookId}/sources/${sourceId}`, {
    method: 'DELETE',
    auth: true,
  });

export const chat = (notebookId: string, message: string, sourceIds?: string[]) =>
  request<ChatResponse>(`/notebooks/${notebookId}/chat`, {
    method: 'POST',
    body: { message, sourceIds },
    auth: true,
  });

/* ------------------------------ Streaming ------------------------- */
export interface ChatStreamHandlers {
  onCitations?: (citations: Citation[]) => void;
  onDelta?: (text: string) => void;
  onError?: (message: string) => void;
}

/** Streaming chat over SSE (fetch, so we can send the Bearer token). */
export async function chatStream(
  notebookId: string,
  message: string,
  sourceIds: string[] | undefined,
  handlers: ChatStreamHandlers,
): Promise<void> {
  const doFetch = () =>
    fetch(`${API_BASE}/notebooks/${notebookId}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ message, sourceIds }),
    });

  let res = await doFetch();
  if (res.status === 401) {
    await refresh();
    res = await doFetch();
  }
  if (!res.ok || !res.body) {
    throw new ApiError(res.status, `Stream failed with status ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = /event: (.*)/.exec(block)?.[1];
      const dataMatch = /data: ([\s\S]*)/.exec(block)?.[1];
      if (!event || dataMatch == null) continue;
      const data = JSON.parse(dataMatch);
      if (event === 'citations') handlers.onCitations?.(data as Citation[]);
      else if (event === 'delta') handlers.onDelta?.((data as { text: string }).text);
      else if (event === 'error') handlers.onError?.((data as { message: string }).message);
    }
  }
}

/* -------------------------------- ANAM ---------------------------- */
export const anamStatus = () =>
  request<{ configured: boolean }>('/anam/status', { auth: true });

export const anamSessionToken = () =>
  request<{ sessionToken: string }>('/anam/session-token', { method: 'POST', auth: true });

/* ------------------------- Spatius + Piper TTS -------------------- */
export const spatiusConfig = () =>
  request<{ configured: boolean; appId: string | null; avatarId: string | null }>('/spatius/config', {
    auth: true,
  });

export const spatiusSessionToken = () =>
  request<{ sessionToken: string }>('/spatius/session-token', { method: 'POST', auth: true });

export const ttsStatus = () =>
  request<{ configured: boolean; sampleRate: number }>('/tts/status', { auth: true });

/** Synthesize speech → raw PCM16 mono (ArrayBuffer) to feed the Spatius avatar. */
export async function ttsSpeak(text: string): Promise<ArrayBuffer> {
  const doFetch = () =>
    fetch(`${API_BASE}/tts/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ text }),
    });

  let res = await doFetch();
  if (res.status === 401) {
    await refresh();
    res = await doFetch();
  }
  if (!res.ok) throw new ApiError(res.status, `TTS failed with status ${res.status}`);
  return res.arrayBuffer();
}
