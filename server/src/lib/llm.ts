import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';

export interface ContextBlock {
  n: number;
  sourceTitle: string;
  text: string;
}

const SYSTEM_PROMPT = `You are Buddyy, a focused and encouraging study assistant.
Answer the student's question using ONLY the numbered sources provided.
Cite every claim with bracketed numbers like [1] that refer to those sources.
If the answer is not in the sources, say so plainly and suggest what the student could add.
Your reply is spoken aloud by a talking avatar, so write in plain, natural sentences.
Do NOT use markdown, asterisks, bullet characters, headings, or emojis.
Keep it clear, concise, and easy to follow when heard.`;

function buildUserPrompt(question: string, contexts: ContextBlock[]): string {
  const contextText = contexts.map((c) => `[${c.n}] (${c.sourceTitle})\n${c.text}`).join('\n\n');
  return `Sources:\n${contextText}\n\nQuestion: ${question}`;
}

type Provider = 'anthropic' | 'gemini' | 'ollama' | 'dev';

function resolveProvider(): Provider {
  switch (env.LLM_PROVIDER) {
    case 'anthropic':
      return 'anthropic';
    case 'gemini':
      return 'gemini';
    case 'ollama':
      return 'ollama';
    case 'dev':
      return 'dev';
    case 'auto':
    default:
      if (env.ANTHROPIC_API_KEY) return 'anthropic';
      if (env.GEMINI_API_KEY) return 'gemini';
      return 'dev';
  }
}

/** Generates a grounded answer from the retrieved context. */
export async function answer(question: string, contexts: ContextBlock[]): Promise<string> {
  switch (resolveProvider()) {
    case 'anthropic':
      return anthropicAnswer(question, contexts);
    case 'gemini':
      return geminiAnswer(question, contexts);
    case 'ollama':
      return ollamaAnswer(question, contexts);
    default:
      return devAnswer(contexts);
  }
}

/**
 * Streams the answer as text chunks. Only Gemini streams token-by-token; other
 * providers yield the full answer once (still works, just not incremental).
 */
export async function* answerStream(
  question: string,
  contexts: ContextBlock[],
): AsyncGenerator<string> {
  if (resolveProvider() === 'gemini') {
    yield* geminiAnswerStream(question, contexts);
    return;
  }
  yield await answer(question, contexts);
}

async function* geminiAnswerStream(
  question: string,
  contexts: ContextBlock[],
): AsyncGenerator<string> {
  const res = await fetch(
    `${env.GEMINI_BASE_URL}/models/${env.GEMINI_CHAT_MODEL}:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(question, contexts) }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
      }),
    },
  );

  if (!res.ok || !res.body) {
    // Fall back to a single non-streamed answer.
    yield await geminiAnswer(question, contexts);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let emitted = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = obj.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
        if (text) {
          emitted = true;
          yield text;
        }
      } catch {
        /* skip malformed chunk */
      }
    }
  }

  if (!emitted) yield devAnswer(contexts);
}

// Fast cloud generation via Google Gemini (free tier, e.g. gemini-2.0-flash).
async function geminiAnswer(question: string, contexts: ContextBlock[]): Promise<string> {
  const res = await fetch(
    `${env.GEMINI_BASE_URL}/models/${env.GEMINI_CHAT_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(question, contexts) }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini chat error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();
  return text || devAnswer(contexts);
}

async function anthropicAnswer(question: string, contexts: ContextBlock[]): Promise<string> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: env.LLM_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(question, contexts) }],
  });
  const text = res.content.map((block) => (block.type === 'text' ? block.text : '')).join('').trim();
  return text || devAnswer(contexts);
}

// Free, local generation via Ollama (e.g. `ollama pull llama3.2`).
async function ollamaAnswer(question: string, contexts: ContextBlock[]): Promise<string> {
  const res = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.OLLAMA_CHAT_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(question, contexts) },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama chat error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content?.trim() || devAnswer(contexts);
}

/** Offline fallback: extractive answer built from the top retrieved chunks. */
function devAnswer(contexts: ContextBlock[]): string {
  if (contexts.length === 0) {
    return "I couldn't find anything about that in your selected sources. Try adding a source that covers it.";
  }
  const excerpt = contexts
    .slice(0, 2)
    .map((c) => `${c.text.slice(0, 240).trim()}… [${c.n}]`)
    .join('\n\n');
  return `Here's what your sources say:\n\n${excerpt}\n\n_(Dev mode — set ANTHROPIC_API_KEY for full, synthesized answers.)_`;
}
