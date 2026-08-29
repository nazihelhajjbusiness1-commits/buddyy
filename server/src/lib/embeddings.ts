import { env } from '../config/env';

export type InputType = 'document' | 'query';

export interface Embedder {
  id: string;
  embed(texts: string[], inputType: InputType): Promise<number[][]>;
}

/* --------------------------- Dev embedder ------------------------- */
// Deterministic hashed bag-of-words → fixed-dim unit vector. Good enough for
// keyword-overlap retrieval so the pipeline is testable without an API key.
const DEV_DIMS = 256;

function hashEmbed(text: string, dims: number): number[] {
  const v = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    v[Math.abs(h) % dims] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

const devEmbedder: Embedder = {
  id: `dev-hash-${DEV_DIMS}`,
  async embed(texts) {
    return texts.map((t) => hashEmbed(t, DEV_DIMS));
  },
};

/* -------------------------- Voyage embedder ----------------------- */
const voyageEmbedder: Embedder = {
  id: `voyage:${env.EMBEDDING_MODEL}`,
  async embed(texts, inputType) {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ model: env.EMBEDDING_MODEL, input: texts, input_type: inputType }),
    });
    if (!res.ok) {
      throw new Error(`Voyage embeddings error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  },
};

/* --------------------------- Ollama embedder ---------------------- */
// Free, local embeddings via Ollama (e.g. `ollama pull nomic-embed-text`).
const ollamaEmbedder: Embedder = {
  id: `ollama:${env.OLLAMA_EMBED_MODEL}`,
  async embed(texts) {
    const res = await fetch(`${env.OLLAMA_BASE_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OLLAMA_EMBED_MODEL, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`Ollama embeddings error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { embeddings: number[][] };
    return data.embeddings;
  },
};

/* --------------------------- Gemini embedder ---------------------- */
// Fast cloud embeddings via Google Gemini (free tier). Batches all chunks in one call.
const geminiEmbedder: Embedder = {
  id: `gemini:${env.GEMINI_EMBED_MODEL}`,
  async embed(texts, inputType) {
    const model = `models/${env.GEMINI_EMBED_MODEL}`;
    const taskType = inputType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
    const res = await fetch(
      `${env.GEMINI_BASE_URL}/${model}:batchEmbedContents?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map((t) => ({ model, content: { parts: [{ text: t }] }, taskType })),
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Gemini embeddings error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { embeddings: { values: number[] }[] };
    return data.embeddings.map((e) => e.values);
  },
};

function selectEmbedder(): Embedder {
  switch (env.EMBEDDING_PROVIDER) {
    case 'voyage':
      return voyageEmbedder;
    case 'gemini':
      return geminiEmbedder;
    case 'ollama':
      return ollamaEmbedder;
    case 'dev':
      return devEmbedder;
    case 'auto':
    default:
      if (env.VOYAGE_API_KEY) return voyageEmbedder;
      if (env.GEMINI_API_KEY) return geminiEmbedder;
      return devEmbedder;
  }
}

export const embedder: Embedder = selectEmbedder();

/* ------------------------------ Similarity ------------------------ */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
