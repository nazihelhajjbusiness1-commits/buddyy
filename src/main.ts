import './style.css';
import { createClient } from '@anam-ai/js-sdk';
// Type-only import: erased at build time, so the heavy avatarkit runtime bundle
// is NOT pulled into the initial chunk. The actual module is loaded on demand
// via dynamic import() inside connectSpatius() (Vite code-splits it).
import type { AvatarController } from '@spatius/avatarkit';
import {
  anamSessionToken,
  anamStatus,
  chatStream,
  createNotebook,
  deleteNotebook,
  deleteSource,
  ensureSession,
  listMessages,
  listNotebooks,
  listSources,
  logout,
  renameNotebook,
  spatiusConfig,
  spatiusSessionToken,
  ttsSpeak,
  ttsStatus,
  uploadSource,
  type Citation,
  type Notebook,
  type PublicUser,
  type SourceItem,
} from './lib/api';

/* Minimal shape of the ANAM client we rely on (decoupled from SDK types). */
interface AnamTalkStream {
  streamMessageChunk(text: string, isLast?: boolean): void;
  endMessage(): void;
}
interface AnamClient {
  streamToVideoElement(elementId: string): Promise<void>;
  createTalkMessageStream(): AnamTalkStream;
  talk?(content: string): Promise<void>;
  stopStreaming?(): void;
}

/* ------------------------------------------------------------------ *
 * Lucide is loaded from a CDN <script> in index.html, so we declare
 * its shape for the type checker instead of importing it.
 * ------------------------------------------------------------------ */
declare const lucide: { createIcons: () => void };

/** Initial shown on the current user's avatar (set after auth). */
let currentInitial = 'B';

/* ------------------------------- Types ---------------------------- */
type SourceType = 'lecture' | 'book' | 'article' | 'homework' | 'exam' | 'other';
type ChatRole = 'user' | 'assistant';

/* ---------------------------- DOM helpers ------------------------- */
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node as T;
}

function refreshIcons(): void {
  lucide.createIcons();
}

/* ------------------------------ Sources --------------------------- */
let notebookId = '';
let allNotebooks: Notebook[] = [];
let currentUser: PublicUser | null = null;
let sourceItems: SourceItem[] = [];
let pollTimer: number | undefined;

const typeIcon: Record<SourceType, string> = {
  lecture: 'presentation',
  book: 'book-open',
  article: 'newspaper',
  homework: 'pencil-ruler',
  exam: 'file-check',
  other: 'file-text',
};

const typeTint: Record<SourceType, string> = {
  lecture: 'text-secondary',
  book: 'text-primary',
  article: 'text-accent',
  homework: 'text-warn',
  exam: 'text-success',
  other: 'text-muted',
};

const iconFor = (t: string) => typeIcon[(t as SourceType)] ?? typeIcon.other;
const tintFor = (t: string) => typeTint[(t as SourceType)] ?? typeTint.other;

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function humanSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderSources(): void {
  const list = el<HTMLUListElement>('sourceList');
  el('sourceCount').textContent = String(sourceItems.length);
  list.innerHTML = '';

  if (sourceItems.length === 0) {
    list.innerHTML = `<li class="text-center text-xs text-muted py-8 px-3">No sources yet.<br>Upload a lecture, book, or PDF to start.</li>`;
    return;
  }

  sourceItems.forEach((s, i) => {
    const status =
      s.status === 'ready'
        ? `<span class="text-[11px] text-muted capitalize">${s.type} · ${humanSize(s.sizeBytes)}</span>`
        : s.status === 'processing'
          ? `<span class="text-[11px] text-secondary inline-flex items-center gap-1"><i data-lucide="loader" class="w-3 h-3 animate-spin"></i> processing…</span>`
          : `<span class="text-[11px] text-danger" title="${escapeHtml(s.error ?? '')}">failed to process</span>`;

    const li = document.createElement('li');
    li.className = 'fade-up group flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-surface2';
    li.style.animationDelay = `${i * 50}ms`;
    li.innerHTML = `
      <input type="checkbox" ${s.status === 'ready' ? 'checked' : ''} data-id="${s.id}" data-status="${s.status}" class="accent-primary mt-1 w-3.5 h-3.5 shrink-0" />
      <div class="w-8 h-8 shrink-0 rounded-lg bg-surface2 border border-border grid place-items-center">
        <i data-lucide="${iconFor(s.type)}" class="w-4 h-4 ${tintFor(s.type)}"></i>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-500 leading-tight truncate" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</p>
        <div class="mt-0.5">${status}</div>
      </div>
      <button data-del="${s.id}" class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-surface text-muted hover:text-danger transition-opacity" aria-label="Delete source">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>`;
    list.appendChild(li);
  });

  list.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => void handleDelete(btn.dataset.del ?? ''));
  });
  refreshIcons();
}

async function loadSources(): Promise<void> {
  const { sources } = await listSources(notebookId);
  sourceItems = sources;
  renderSources();
  schedulePolling();
}

// While any source is still processing, poll until they're all ready/failed.
function schedulePolling(): void {
  const processing = sourceItems.some((s) => s.status === 'processing');
  if (!processing) {
    if (pollTimer !== undefined) {
      window.clearInterval(pollTimer);
      pollTimer = undefined;
    }
    return;
  }
  if (pollTimer !== undefined) return;
  pollTimer = window.setInterval(() => {
    void (async () => {
      try {
        const { sources } = await listSources(notebookId);
        sourceItems = sources;
        renderSources();
      } catch {
        /* transient — keep polling */
      }
      if (!sourceItems.some((s) => s.status === 'processing')) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    })();
  }, 2000);
}

async function handleDelete(id: string): Promise<void> {
  const previous = sourceItems;
  sourceItems = sourceItems.filter((s) => s.id !== id);
  renderSources();
  try {
    await deleteSource(notebookId, id);
  } catch {
    sourceItems = previous;
    renderSources();
  }
}

async function handleUpload(files: FileList): Promise<void> {
  const type = el<HTMLSelectElement>('sourceType').value;
  const btn = el<HTMLButtonElement>('addSourceBtn');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Uploading…';
  refreshIcons();
  try {
    for (const file of Array.from(files)) {
      await uploadSource(notebookId, file, type);
    }
    await loadSources();
    setStatus('Source added — ask me about it!');
  } catch (err) {
    setStatus(`Upload failed: ${(err as Error).message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
    refreshIcons();
  }
}

/* ------------------------------- Chat ----------------------------- */
const log = el<HTMLDivElement>('chatLog');

function bubble(role: ChatRole, html: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'fade-up flex gap-2.5 ' + (role === 'user' ? 'flex-row-reverse' : '');

  const avatar =
    role === 'user'
      ? `<div class="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-secondary to-primary grid place-items-center text-[11px] font-600 text-white">${currentInitial}</div>`
      : `<div class="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center"><i data-lucide="bot" class="w-4 h-4 text-white"></i></div>`;

  const bubbleClass =
    role === 'user'
      ? 'bg-primary text-white rounded-2xl rounded-tr-sm'
      : 'bg-black/45 backdrop-blur border border-white/10 text-white rounded-2xl rounded-tl-sm';

  wrap.innerHTML = `${avatar}<div data-content class="max-w-[80%] px-3.5 py-2.5 text-sm leading-relaxed ${bubbleClass}">${html}</div>`;
  log.appendChild(wrap);
  refreshIcons();
  log.scrollTop = log.scrollHeight;
  return wrap;
}

function showTyping(): void {
  const wrap = document.createElement('div');
  wrap.className = 'flex gap-2.5';
  wrap.id = 'typing';
  wrap.innerHTML = `
    <div class="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center"><i data-lucide="bot" class="w-4 h-4 text-white"></i></div>
    <div class="px-4 py-3 bg-surface2 border border-border rounded-2xl rounded-tl-sm flex gap-1">
      <span class="tdot w-1.5 h-1.5 rounded-full bg-muted"></span>
      <span class="tdot w-1.5 h-1.5 rounded-full bg-muted"></span>
      <span class="tdot w-1.5 h-1.5 rounded-full bg-muted"></span>
    </div>`;
  log.appendChild(wrap);
  refreshIcons();
  log.scrollTop = log.scrollHeight;
}

function selectedReadySourceIds(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('#sourceList input[type=checkbox][data-id]'),
  )
    .filter((cb) => cb.checked && cb.dataset.status === 'ready')
    .map((cb) => cb.dataset.id ?? '');
}

function formatAnswer(answerText: string, citations: Citation[]): string {
  const body = escapeHtml(answerText)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(\d+)\]/g, '<sup class="text-accent font-600">[$1]</sup>')
    .replace(/^\s*[*-]\s+/gm, '• ')
    .replace(/\n{2,}/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br>');

  let html = `<p>${body}</p>`;
  if (citations.length > 0) {
    const chips = citations
      .map(
        (c) =>
          `<span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/80"><span class="text-accent font-600">[${c.n}]</span> ${escapeHtml(c.sourceTitle)}</span>`,
      )
      .join(' ');
    html += `<div class="mt-2.5 pt-2 border-t border-white/15 flex flex-wrap gap-1.5">${chips}</div>`;
  }
  return html;
}

async function sendMessage(): Promise<void> {
  const input = el<HTMLTextAreaElement>('chatInput');
  const value = input.value.trim();
  if (!value || !notebookId) return;

  bubble('user', escapeHtml(value));
  input.value = '';
  input.style.height = 'auto';
  showTyping();
  if (voiceOn) setSpeaking(true);
  setStatus('Thinking…');

  const ids = selectedReadySourceIds();
  // Have the avatar speak the streamed answer, if it's connected and unmuted.
  const talk = anamClient && voiceOn ? anamClient.createTalkMessageStream() : null;

  let citations: Citation[] = [];
  let full = '';
  let contentEl: HTMLElement | null = null;

  const ensureBubble = (): HTMLElement => {
    if (!contentEl) {
      document.getElementById('typing')?.remove();
      const wrap = bubble('assistant', '');
      contentEl = wrap.querySelector<HTMLElement>('[data-content]');
      setStatus('Explaining from your sources…');
    }
    return contentEl!;
  };

  try {
    await chatStream(notebookId, value, ids.length > 0 ? ids : undefined, {
      onCitations: (c) => {
        citations = c;
      },
      onDelta: (text) => {
        full += text;
        const target = ensureBubble();
        target.innerHTML = formatAnswer(full, citations);
        talk?.streamMessageChunk(text, false);
        log.scrollTop = log.scrollHeight;
      },
      onError: (message) => {
        ensureBubble().innerHTML = `<span class="text-danger">${escapeHtml(message)}</span>`;
      },
    });
    talk?.endMessage();
    if (avatarProvider === 'spatius' && full.trim()) void speakSpatius(full);
  } catch (err) {
    document.getElementById('typing')?.remove();
    if (!contentEl) {
      bubble(
        'assistant',
        `<span class="text-danger">Sorry — ${escapeHtml((err as Error).message || 'request failed')}.</span>`,
      );
    }
  } finally {
    // If ANAM is speaking, it drives its own timing; otherwise stop the orb soon.
    window.setTimeout(
      () => {
        if (!anamClient) setSpeaking(false);
        setStatus('Ready to help you study.');
      },
      anamClient ? 400 : 1500,
    );
  }
}

/* ------------------------------- Avatar --------------------------- */
let anamClient: AnamClient | null = null;
let avatarProvider: 'anam' | 'spatius' | 'none' = 'none';
let spatiusController: AvatarController | null = null;

async function connectAvatar(): Promise<void> {
  const connectBtn = document.getElementById('avatarConnectBtn');
  try {
    setStatus('Connecting avatar…');
    const { sessionToken } = await anamSessionToken();
    // disableInputAudio: we drive speech ourselves; no microphone capture needed.
    const client = createClient(sessionToken, { disableInputAudio: true }) as unknown as AnamClient;
    await client.streamToVideoElement('anamVideo');
    anamClient = client;

    const video = document.getElementById('anamVideo') as HTMLVideoElement | null;
    video?.classList.remove('hidden');
    void video?.play?.().catch(() => undefined);
    document.getElementById('anamFallback')?.classList.add('hidden');
    connectBtn?.classList.add('hidden');
    setStatus('Connected — ask me anything.');

    // Resume playback on the first user gesture (covers autoplay restrictions).
    document.addEventListener(
      'click',
      () => void (document.getElementById('anamVideo') as HTMLVideoElement | null)?.play?.().catch(() => undefined),
      { once: true },
    );
  } catch (err) {
    connectBtn?.classList.remove('hidden');
    setStatus('Avatar offline — tap the tile to connect.');
    // eslint-disable-next-line no-console
    console.warn('Avatar connect failed:', (err as Error).message);
  }
}

// Chooses the avatar provider: Spatius if configured, else ANAM, else orb.
async function initAvatar(): Promise<void> {
  try {
    const sp = await spatiusConfig();
    if (sp.configured && sp.appId && sp.avatarId) {
      avatarProvider = 'spatius';
      const { appId, avatarId } = sp;
      const btn = el('avatarConnectBtn');
      btn.classList.remove('hidden'); // Spatius audio needs a user gesture
      btn.addEventListener('click', () => void connectSpatius(appId, avatarId));
      setStatus('Tap “Start avatar” to begin.');
      return;
    }
  } catch {
    /* Spatius unavailable — try ANAM */
  }

  try {
    const { configured } = await anamStatus();
    if (!configured) return;
    avatarProvider = 'anam';
    el('avatarConnectBtn').addEventListener('click', () => void connectAvatar());
    await connectAvatar();
  } catch {
    /* keep the orb */
  }
}

async function connectSpatius(appId: string, avatarId: string): Promise<void> {
  const btn = document.getElementById('avatarConnectBtn');
  try {
    setStatus('Connecting avatar…');
    // Lazy-load the avatarkit runtime only when actually connecting to Spatius.
    const {
      AvatarSDK,
      AvatarManager,
      AvatarView,
      ConnectionState,
      ConversationState,
      DrivingServiceMode,
    } = await import('@spatius/avatarkit');
    const tts = await ttsStatus();
    const { sessionToken } = await spatiusSessionToken();

    await AvatarSDK.initialize(appId, {
      drivingServiceMode: DrivingServiceMode.direct,
      audioFormat: { channelCount: 1, sampleRate: tts.sampleRate || 22050 },
    });
    AvatarSDK.setSessionToken(sessionToken);

    const avatar = await AvatarManager.shared.load(avatarId);
    const container = el('spatiusMount');
    container.classList.remove('hidden');
    document.getElementById('anamMount')?.classList.add('hidden');

    const controller = new AvatarView(avatar, container).controller;
    controller.onConnectionState = (state) => {
      if (state === ConnectionState.failed) setStatus('Avatar connection lost.');
    };
    controller.onConversationState = (state) => {
      setSpeaking(state === ConversationState.playing);
    };
    await controller.initializeAudioContext();
    await controller.start();
    spatiusController = controller;

    btn?.classList.add('hidden');
    setStatus('Connected — ask me anything.');
  } catch (err) {
    btn?.classList.remove('hidden');
    setStatus('Avatar failed to connect — tap to retry.');
    // eslint-disable-next-line no-console
    console.warn('Spatius connect failed:', (err as Error).message);
  }
}

// Speak text through Piper TTS → Spatius avatar (PCM16 fed to controller.send).
async function speakSpatius(text: string): Promise<void> {
  if (!spatiusController) return;
  try {
    const pcm = await ttsSpeak(text);
    spatiusController.send(pcm, true);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('TTS/speak failed:', (err as Error).message);
  }
}

/* --------------------------- Avatar state ------------------------- */
const avatarWrap = el('avatarWrap');
const speakBadge = el('speakBadge');
let voiceOn = true;

function setSpeaking(on: boolean): void {
  avatarWrap.classList.toggle('speaking', on);
  speakBadge.style.opacity = on ? '1' : '0.25';
}

function setStatus(text: string): void {
  el('avatarStatus').textContent = text;
}

function toggleVoice(): void {
  voiceOn = !voiceOn;
  const btn = el<HTMLButtonElement>('speakBtn');
  btn.innerHTML = voiceOn
    ? '<i data-lucide="volume-2" class="w-5 h-5 text-white"></i>'
    : '<i data-lucide="volume-x" class="w-5 h-5 text-white"></i>';
  btn.classList.toggle('bg-primary', voiceOn);
  btn.classList.toggle('bg-surface2', !voiceOn);
  btn.classList.toggle('border', !voiceOn);
  btn.classList.toggle('border-border', !voiceOn);
  if (!voiceOn) setSpeaking(false);
  refreshIcons();
}

/* -------------- Mic / camera focus monitoring (real) -------------- */
let micOn = false;
let camOn = false;

// Live signals (smoothed) and derived state.
let audioLevel = 0; // 0..1 RMS
let motionLevel = 0; // 0..1 frame-difference
let focusScore = 92; // 0..100
let awayTicks = 0;
let lastNudge = 0;

// Capture resources.
let micStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let micRaf = 0;
let camStream: MediaStream | null = null;
let motionTimer: number | undefined;
let prevFrame: Uint8ClampedArray | null = null;

// Object detection (lazy-loaded when the camera turns on).
let detector: import('@tensorflow-models/coco-ssd').ObjectDetection | null = null;
let phoneVisible = false;
let detectTimer: number | undefined;
let detecting = false;

function syncDock(): void {
  el('monitorDock').classList.toggle('hidden', !(micOn || camOn));
}

/* ------------------------------- Mic ------------------------------ */
async function toggleMic(): Promise<void> {
  const btn = el<HTMLButtonElement>('micBtn');
  if (!micOn) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus('Microphone permission was blocked.');
      return;
    }
    micOn = true;
    audioCtx = new AudioContext();
    void audioCtx.resume().catch(() => undefined);
    const source = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    startMicMeter();
    setStatus('I’m listening — stay focused, you’ve got this.');
  } else {
    micOn = false;
    cancelAnimationFrame(micRaf);
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null;
    void audioCtx?.close().catch(() => undefined);
    audioCtx = null;
    analyser = null;
    audioLevel = 0;
  }
  btn.setAttribute('aria-pressed', String(micOn));
  btn.innerHTML = micOn
    ? '<i data-lucide="mic" class="w-5 h-5 text-white"></i>'
    : '<i data-lucide="mic-off" class="w-5 h-5 text-white/70"></i>';
  btn.classList.toggle('bg-primary', micOn);
  btn.classList.toggle('border-primary', micOn);
  el('micPanel').classList.toggle('hidden', !micOn);
  syncDock();
  refreshIcons();
}

function startMicMeter(): void {
  const bars = Array.from(document.querySelectorAll<HTMLElement>('#micBars .mic-bar'));
  const time = new Uint8Array(analyser!.fftSize);
  const freq = new Uint8Array(analyser!.frequencyBinCount);
  const micStatus = document.getElementById('micStatus');

  const loop = (): void => {
    if (!analyser) return;
    analyser.getByteTimeDomainData(time);
    let sum = 0;
    for (const v of time) {
      const x = (v - 128) / 128;
      sum += x * x;
    }
    audioLevel = audioLevel * 0.8 + Math.sqrt(sum / time.length) * 0.2;

    analyser.getByteFrequencyData(freq);
    const step = Math.max(1, Math.floor(freq.length / (bars.length || 1)));
    bars.forEach((bar, i) => {
      bar.style.height = `${10 + ((freq[i * step] ?? 0) / 255) * 90}%`;
    });
    if (micStatus) {
      micStatus.textContent = audioLevel > 0.22 ? 'Noise detected nearby' : 'Quiet — good for studying';
    }
    micRaf = requestAnimationFrame(loop);
  };
  micRaf = requestAnimationFrame(loop);
}

/* ----------------------------- Camera ----------------------------- */
async function toggleCam(): Promise<void> {
  const btn = el<HTMLButtonElement>('camBtn');
  if (!camOn) {
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
        audio: false,
      });
    } catch {
      setStatus('Camera permission was blocked.');
      return;
    }
    camOn = true;
    const video = el<HTMLVideoElement>('camVideo');
    video.srcObject = camStream;
    void video.play().catch(() => undefined);
    prevFrame = null;
    motionTimer = window.setInterval(detectMotion, 220);
    void ensureDetector().catch(() => undefined);
    detectTimer = window.setInterval(() => void runDetection(), 900);
  } else {
    camOn = false;
    if (motionTimer) window.clearInterval(motionTimer);
    motionTimer = undefined;
    if (detectTimer) window.clearInterval(detectTimer);
    detectTimer = undefined;
    phoneVisible = false;
    camStream?.getTracks().forEach((t) => t.stop());
    camStream = null;
    motionLevel = 0;
    awayTicks = 0;
  }
  btn.setAttribute('aria-pressed', String(camOn));
  btn.innerHTML = camOn
    ? '<i data-lucide="video" class="w-5 h-5 text-white"></i>'
    : '<i data-lucide="video-off" class="w-5 h-5 text-white/70"></i>';
  btn.classList.toggle('bg-secondary', camOn);
  btn.classList.toggle('border-secondary', camOn);
  el('camPanel').classList.toggle('hidden', !camOn);
  syncDock();
  refreshIcons();
}

// Frame-difference motion estimate from the webcam (all in-browser).
function detectMotion(): void {
  const video = el<HTMLVideoElement>('camVideo');
  if (video.readyState < 2) return;
  const canvas = el<HTMLCanvasElement>('camCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  if (prevFrame) {
    let diff = 0;
    for (let i = 0; i < frame.length; i += 4) diff += Math.abs(frame[i] - prevFrame[i]);
    motionLevel = motionLevel * 0.7 + (diff / (canvas.width * canvas.height * 255)) * 0.3;
  }
  prevFrame = frame.slice();
}

// Lazy-load TensorFlow.js + COCO-SSD only when the camera is used.
async function ensureDetector(): Promise<import('@tensorflow-models/coco-ssd').ObjectDetection | null> {
  if (detector) return detector;
  try {
    setStatus('Loading focus detection…');
    await import('@tensorflow/tfjs');
    const cocoSsd = await import('@tensorflow-models/coco-ssd');
    detector = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    setStatus('Camera on — I’m watching your focus.');
    return detector;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Object detection unavailable:', (err as Error).message);
    return null;
  }
}

// Detect whether a phone is visible in the webcam frame.
async function runDetection(): Promise<void> {
  if (detecting || !camOn) return;
  const video = el<HTMLVideoElement>('camVideo');
  if (video.readyState < 2) return;
  const model = detector ?? (await ensureDetector());
  if (!model) return;

  detecting = true;
  try {
    const predictions = await model.detect(video, 10);
    phoneVisible = predictions.some((p) => p.class === 'cell phone' && p.score > 0.45);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Detection error:', (err as Error).message);
  } finally {
    detecting = false;
  }
  updateCamStatus();
}

function updateCamStatus(): void {
  const camStatus = document.getElementById('camStatus');
  if (!camStatus) return;
  let text = 'At your desk';
  let style = 'bg-success/20 text-success border-success/30';
  if (phoneVisible) {
    text = 'Phone in view';
    style = 'bg-danger/20 text-danger border-danger/30';
  } else if (awayTicks >= 3) {
    text = 'Away from desk';
    style = 'bg-danger/20 text-danger border-danger/30';
  }
  camStatus.textContent = text;
  camStatus.className = `absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded border ${style}`;
}

/* --------------------------- Focus engine ------------------------- */
function startFocusLoop(): void {
  window.setInterval(() => {
    if (!(micOn || camOn)) return;

    let target = 94;
    if (camOn) {
      if (motionLevel < 0.004) awayTicks += 1;
      else awayTicks = 0;
      if (phoneVisible) target -= 48; // phone spotted → strong penalty
      else if (awayTicks >= 3) target -= 55; // ~6s of stillness → likely away
      else if (motionLevel > 0.14) target -= 22; // lots of movement / fidgeting
    }
    if (micOn && audioLevel > 0.25) target -= 16; // sustained noise / chatter

    focusScore += (target - focusScore) * 0.5;
    const pct = Math.max(4, Math.min(100, Math.round(focusScore)));

    let label = 'Deep focus';
    let cls = 'bg-success';
    if (pct < 45) {
      label = phoneVisible
        ? 'On your phone — put it down!'
        : camOn && awayTicks >= 3
          ? 'Away — come back!'
          : 'Distracted — refocus!';
      cls = 'bg-danger';
    } else if (pct < 72) {
      label = 'Getting distracted';
      cls = 'bg-warn';
    } else if (pct < 88) {
      label = 'Focused';
      cls = 'bg-success';
    }

    el('focusLabel').textContent = label;
    const dot = document.querySelector<HTMLSpanElement>('#pillFocus span');
    if (dot) dot.className = `w-2 h-2 rounded-full animate-pulse ${cls}`;
    el('focusPct').textContent = `${pct}%`;
    el('focusBar').style.width = `${pct}%`;
    updateCamStatus();

    if (pct < 50) {
      maybeNudge(
        phoneVisible
          ? 'I can see your phone — put it down and let’s keep studying.'
          : undefined,
      );
    }
  }, 1500);
}

// Encourage the student when focus drops — spoken by the avatar if connected.
function maybeNudge(message?: string): void {
  const now = Date.now();
  if (now - lastNudge < 30000) return;
  lastNudge = now;
  const msg = message ?? 'Hey — let’s get back to it. You were doing great.';
  setStatus(msg);
  if (voiceOn && anamClient?.talk) {
    void anamClient.talk(msg).catch(() => undefined);
    setSpeaking(true);
    window.setTimeout(() => setSpeaking(false), 3000);
  } else if (voiceOn && avatarProvider === 'spatius' && spatiusController) {
    void speakSpatius(msg); // onConversationState drives the speaking glow
  } else if (voiceOn) {
    setSpeaking(true);
    window.setTimeout(() => setSpeaking(false), 2500);
  }
}

/* --------------------------- Notebooks ---------------------------- */
async function loadNotebooks(): Promise<void> {
  const { notebooks } = await listNotebooks();
  allNotebooks = notebooks;
  if (allNotebooks.length === 0) {
    const created = (await createNotebook('My Study Notebook')).notebook;
    allNotebooks = [created];
  }
  // Keep the current selection if it still exists, else pick the first.
  const current = allNotebooks.find((n) => n.id === notebookId) ?? allNotebooks[0];
  notebookId = current.id;
  el('notebookTitle').textContent = current.title;
  wireNotebookMenu();
}

/** Switch to another notebook: reload its sources, history, and reset chat. */
async function switchNotebook(id: string): Promise<void> {
  if (id === notebookId) return;
  notebookId = id;
  if (pollTimer !== undefined) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  }
  const nb = allNotebooks.find((n) => n.id === id);
  if (nb) el('notebookTitle').textContent = nb.title;
  await loadSources();
  await renderHistory();
}

/** Renders persisted chat history for the current notebook (or a greeting). */
async function renderHistory(): Promise<void> {
  log.innerHTML = '';
  let messages: Awaited<ReturnType<typeof listMessages>>['messages'] = [];
  try {
    messages = (await listMessages(notebookId)).messages;
  } catch {
    /* history unavailable — fall through to greeting */
  }

  if (messages.length === 0) {
    const name = currentUser ? firstNameOf(currentUser) : 'there';
    bubble(
      'assistant',
      `Hi ${name}. Upload your lectures, books, or notes on the left, then ask me anything — I’ll answer from your sources and cite them.`,
    );
    return;
  }

  for (const m of messages) {
    if (m.role === 'user') bubble('user', escapeHtml(m.content));
    else bubble('assistant', formatAnswer(m.content, m.citations));
  }
  log.scrollTop = log.scrollHeight;
}

/**
 * Wires the notebook title into a lightweight switcher menu: pick another
 * notebook, create, rename, or delete. Built in JS and anchored under the title
 * so it needs no extra markup in index.html.
 */
function wireNotebookMenu(): void {
  const title = el('notebookTitle');
  title.style.cursor = 'pointer';
  title.setAttribute('role', 'button');
  title.setAttribute('tabindex', '0');
  title.title = 'Switch notebook';

  const openMenu = (): void => {
    document.getElementById('notebookMenu')?.remove();
    const rect = title.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'notebookMenu';
    menu.className =
      'fixed z-50 min-w-56 max-w-72 bg-surface border border-border rounded-xl shadow-xl p-1 text-sm';
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${rect.left}px`;

    const rows = allNotebooks
      .map(
        (n) => `
        <button data-switch="${n.id}" class="w-full text-left px-3 py-2 rounded-lg hover:bg-surface2 flex items-center justify-between gap-2 ${
          n.id === notebookId ? 'text-primary font-600' : ''
        }">
          <span class="truncate">${escapeHtml(n.title)}</span>
          ${n.id === notebookId ? '<i data-lucide="check" class="w-4 h-4 shrink-0"></i>' : ''}
        </button>`,
      )
      .join('');

    menu.innerHTML = `
      <div class="px-2 py-1 text-[11px] uppercase tracking-wide text-muted">Notebooks</div>
      ${rows}
      <div class="my-1 border-t border-border"></div>
      <button data-action="new" class="w-full text-left px-3 py-2 rounded-lg hover:bg-surface2 flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> New notebook</button>
      <button data-action="rename" class="w-full text-left px-3 py-2 rounded-lg hover:bg-surface2 flex items-center gap-2"><i data-lucide="pencil" class="w-4 h-4"></i> Rename</button>
      <button data-action="delete" class="w-full text-left px-3 py-2 rounded-lg hover:bg-surface2 flex items-center gap-2 text-danger"><i data-lucide="trash-2" class="w-4 h-4"></i> Delete</button>`;

    document.body.appendChild(menu);
    refreshIcons();

    const close = (): void => menu.remove();
    menu.querySelectorAll<HTMLButtonElement>('[data-switch]').forEach((b) =>
      b.addEventListener('click', () => {
        close();
        void switchNotebook(b.dataset.switch ?? '');
      }),
    );
    menu.querySelector('[data-action="new"]')?.addEventListener('click', () => {
      close();
      void handleNewNotebook();
    });
    menu.querySelector('[data-action="rename"]')?.addEventListener('click', () => {
      close();
      void handleRenameNotebook();
    });
    menu.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
      close();
      void handleDeleteNotebook();
    });
    window.setTimeout(() => {
      document.addEventListener('click', function onDoc(e) {
        if (!menu.contains(e.target as Node)) {
          close();
          document.removeEventListener('click', onDoc);
        }
      });
    }, 0);
  };

  title.onclick = openMenu;
  title.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu();
    }
  };
}

async function handleNewNotebook(): Promise<void> {
  const name = window.prompt('Name your new notebook:', 'New notebook');
  if (name === null) return;
  const { notebook } = await createNotebook(name.trim() || 'Untitled notebook');
  await loadNotebooks();
  await switchNotebook(notebook.id);
}

async function handleRenameNotebook(): Promise<void> {
  const current = allNotebooks.find((n) => n.id === notebookId);
  const name = window.prompt('Rename notebook:', current?.title ?? '');
  if (name === null || !name.trim()) return;
  await renameNotebook(notebookId, name.trim());
  await loadNotebooks();
}

async function handleDeleteNotebook(): Promise<void> {
  if (allNotebooks.length <= 1) {
    setStatus('You need at least one notebook.');
    return;
  }
  const current = allNotebooks.find((n) => n.id === notebookId);
  if (!window.confirm(`Delete “${current?.title ?? 'this notebook'}” and all its sources?`)) return;
  await deleteNotebook(notebookId);
  notebookId = '';
  await loadNotebooks();
  await loadSources();
  await renderHistory();
}

function setSidebar(open: boolean): void {
  el('sidebar').classList.toggle('-translate-x-full', !open);
  el('sidebarBackdrop').classList.toggle('hidden', !open);
}

/* ------------------------------ Session --------------------------- */
function firstNameOf(user: PublicUser): string {
  return (user.name?.trim() || user.email).split(/[\s@]/)[0];
}

function applyUser(user: PublicUser): void {
  currentInitial = (user.name?.trim() || user.email).charAt(0).toUpperCase();
  el('userMenuBtn').textContent = currentInitial;
  el('userMenuName').textContent = user.name?.trim() || user.email.split('@')[0];
  el('userMenuEmail').textContent = user.email;
}

function wireUserMenu(): void {
  const btn = el('userMenuBtn');
  const menu = el('userMenu');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const nowHidden = menu.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!nowHidden));
  });
  document.addEventListener('click', (e) => {
    if (e.target !== btn && !menu.contains(e.target as Node)) menu.classList.add('hidden');
  });
  el('logoutBtn').addEventListener('click', async () => {
    await logout();
    window.location.href = '/auth.html';
  });
}

/* ------------------------------ Wire-up --------------------------- */
async function init(): Promise<void> {
  // Auth guard: exchange the refresh cookie for a session, else go to sign-in.
  const user = await ensureSession();
  if (!user) {
    window.location.href = '/auth.html';
    return;
  }
  currentUser = user;
  applyUser(user);
  wireUserMenu();

  await loadNotebooks();
  await loadSources();
  await renderHistory(); // shows persisted chat, or a greeting for a fresh notebook
  void initAvatar(); // connect the avatar in the background (graceful if unconfigured)

  // Presence + voice controls
  el('micBtn').addEventListener('click', toggleMic);
  el('camBtn').addEventListener('click', toggleCam);
  el('speakBtn').addEventListener('click', toggleVoice);

  // Header / sources drawer
  el('sidebarToggle').addEventListener('click', () => setSidebar(true));
  el('sidebarClose').addEventListener('click', () => setSidebar(false));
  el('sidebarBackdrop').addEventListener('click', () => setSidebar(false));

  const fileInput = el<HTMLInputElement>('fileInput');
  el('addSourceBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) void handleUpload(fileInput.files);
    fileInput.value = '';
  });

  el<HTMLInputElement>('selectAll').addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    document
      .querySelectorAll<HTMLInputElement>('#sourceList input[type=checkbox][data-id]')
      .forEach((cb) => {
        cb.checked = on;
      });
  });

  // Suggested prompts
  document.querySelectorAll<HTMLButtonElement>('.quick-prompt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = el<HTMLTextAreaElement>('chatInput');
      input.value = btn.textContent?.trim() ?? '';
      input.focus();
    });
  });

  // Chat input
  const form = el<HTMLFormElement>('chatForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void sendMessage();
  });

  const textarea = el<HTMLTextAreaElement>('chatInput');
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 112)}px`;
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  });

  setSpeaking(false);
  startFocusLoop();
  refreshIcons();
}

document.addEventListener('DOMContentLoaded', () => void init());
