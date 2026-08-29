# Buddyy — Cost Analysis

_Prepared 2026-08-25. All third-party prices are as published on that date and
will drift — re-check before committing to a plan._

This estimates what Buddyy costs to run, in three buckets: **AI/API usage**
(scales with users), **avatar + voice** (the dominant driver), and **hosting/
deployment** (mostly fixed). It ends with monthly scenarios and cost-control
levers.

> **Key finding:** Spatius does **not** include a voice — it bills only for
> avatar motion/rendering and expects bring-your-own TTS. A provider-supplied
> voice means either **ANAM** (turnkey, voice included, expensive per minute) or
> **Spatius + a paid cloud TTS** (much cheaper end-to-end). The avatar minutes
> dominate total cost at any real scale.

---

## 1. Unit prices (as of 2026-08-25)

| Component | Provider / plan | Price |
|---|---|---|
| Chat LLM | Google Gemini 2.5 Flash-Lite | **$0.10 / M input**, $0.40 / M output |
| Embeddings | Gemini Embedding | **$0.15 / M tokens** (one-time, at upload) |
| Avatar (motion only) | **Spatius** Builder/Scale | **$0.007–0.009 / min** ($19–$299/mo tiers) |
| Avatar + voice (turnkey) | **ANAM** | **~$0.15 / min blended** (~$0.12–0.24 across plans) |
| TTS (if using Spatius) | **Deepgram Aura-2** | **$0.03 / 1k chars** ($30 / M) |
| TTS (premium option) | ElevenLabs Flash / Multilingual | $0.05 / $0.10 per 1k chars |
| TTS (free option) | Piper / Edge (self-hosted) | $0 (rejected — quality/emotion) |

Free tiers useful during dev/pilot: Gemini free tier, **Spatius Free = 100 min/mo**,
ANAM includes some free minutes, Supabase/Vercel/Cloudflare free tiers.

---

## 2. Assumptions (tune these — they drive everything)

| Assumption | Value |
|---|---|
| Study session length | 30 min |
| **Avatar speaking time per session** (on-demand streaming) | **12 min** (~40% talk) |
| Answers per session | 12 |
| Words per answer | ~130 (~780 chars) |
| LLM tokens per answer | ~2,500 in / ~220 out (RAG context + answer) |
| Sessions per active user per month | 16 (≈ 4×/week) |

**On-demand streaming is assumed** (avatar connects only while speaking, per
roadmap item #11). Leaving the avatar streaming for the full 30 min instead of
12 would roughly **2.5× the avatar cost** — the single biggest lever.

---

## 3. Cost per active user per month

### Path A — Spatius + Deepgram TTS (recommended for cost)
| Item | Math | $/user/mo |
|---|---|---|
| Chat LLM | 16 × 12 × (2.5k in + 0.22k out) | ~$0.07 |
| Embeddings | ~1 doc/mo | ~$0.05 |
| TTS (Deepgram) | 16 × 9.4k chars × $0.00003 | ~$4.50 |
| Avatar (Spatius) | 16 × 12 min × $0.008 | ~$1.54 |
| **Total variable** | | **~$6 / user / mo** |

### Path B — ANAM (voice included)
| Item | Math | $/user/mo |
|---|---|---|
| Chat + embeddings | (same as above) | ~$0.12 |
| Avatar + voice (ANAM) | 16 × 12 min × $0.15 | ~$28.80 |
| **Total variable** | | **~$29 / user / mo** |

> Note: with Spatius, **TTS ($4.50) actually exceeds the avatar cost ($1.54)** —
> so the choice of TTS matters most on that path. Dropping to a free/cheaper
> voice would cut Path A to ~$2/user/mo.

---

## 4. Fixed hosting / deployment (monthly)

| Component | Scrappy (free tiers) | Production |
|---|---|---|
| Backend (Render/Railway/Fly) | $0–7 | $25 |
| Postgres + pgvector (Supabase/Neon) | $0 | $25 |
| Redis for job queue (Upstash) | $0 | $10 |
| Object storage (Cloudflare R2 — no egress) | $0–5 | $5–15 |
| Frontend static (Vercel/Cloudflare Pages) | $0 | $20 |
| Transactional email (Resend/SES) | $0 (3k/mo) | $20 |
| Error tracking (Sentry) | $0 | $26 |
| Domain | ~$1 | ~$1 |
| **Total fixed** | **~$10–20/mo** | **~$130–150/mo** |

---

## 5. Monthly scenarios (Path A: Spatius + Deepgram, on-demand)

| Stage | Users | Variable (~$6/user) | Fixed | **Total / mo** | ANAM equiv (Path B) |
|---|---|---|---|---|---|
| Dev / pilot (free tiers) | ~10 | mostly free | ~$15 | **~$15–60** | ~$15–60 |
| Small pilot | 25 | ~$150 | ~$50 | **~$200** | ~$770 |
| Growing | 100 | ~$600 | ~$120 | **~$720** | ~$3,000 |
| Mid | 500 | ~$3,000 | ~$300 | **~$3,300** | ~$14,700 |
| Larger | 1,000 | ~$6,000 | ~$500 | **~$6,500** | ~$29,300 |

**Takeaways**
- During development and a tiny pilot, free tiers keep you at roughly **$0–60/mo**.
- The **avatar/voice bucket is ~90%+ of cost** at scale. Everything else (LLM,
  embeddings, hosting) is comparatively rounding error.
- **Path A (Spatius+Deepgram) is ~4–5× cheaper than ANAM.** The trade-off is
  more integration work and you must supply a good voice.

---

## 6. Cost-control levers (in order of impact)

1. **On-demand avatar streaming** — connect/stream only while speaking, auto-
   disconnect when idle. Biggest single lever (roadmap #11).
2. **Choose the cheap avatar path** — Spatius motion at ~$0.008/min vs ANAM's
   ~$0.15/min, if you can supply the voice.
3. **Pick a mid-priced TTS** — Deepgram Aura ($30/M) over ElevenLabs
   ($50–100/M) unless voice quality is a selling point.
4. **Cap usage per plan tier** — avatar minutes are the metered resource; add
   per-user monthly minute caps to prevent runaway bills.
5. **Keep Gemini Flash-Lite** for chat — already near-free; don't upgrade to Pro
   unless answer quality demands it.
6. **Self-host avatar at large scale** — a GPU-hosted avatar (Duix/MuseTalk)
   removes per-minute fees entirely once volume justifies the fixed GPU cost
   (roadmap #13).

---

## 7. Complete cost inventory (everything that can bill you)

Scanned from the codebase (`server/src`, `package.json`) plus what production adds.

| Category | Service | Free during dev? | Paid trigger |
|---|---|---|---|
| Chat LLM | Google Gemini Flash-Lite | ✅ free tier | usage over free tier |
| Embeddings | Gemini Embedding (or Voyage — optional, in code) | ✅ free tier | per upload |
| Avatar | Spatius (motion) **or** ANAM (turnkey) | ✅ free minutes | per streamed minute |
| Voice/TTS | **Azure Neural TTS** (emotion) / Deepgram / ElevenLabs | trial credits | per char |
| Focus monitoring | TF.js + COCO-SSD (client-side) | ✅ always free | — never bills |
| Backend host | **Render** Web Service | free tier spins down | always-on = $7/mo |
| Database | **Render PostgreSQL** + pgvector | free 1-mo trial | $6/mo+ |
| Frontend host | **Vercel** | Hobby free | **commercial use ⇒ Pro $20/mo** |
| Domain | registrar | — | ~$12/yr (.com) / ~$90/yr (.ai) |
| Email | Resend / SES | ✅ 3k/mo free | over free tier |
| Job queue | Upstash Redis (for durable ingestion) | ✅ free tier | at scale |
| File storage | Cloudflare R2 (no egress fees) | ✅ 10 GB free | over free tier |
| Payments | Stripe | — | **2.9% + $0.30 per charge** |
| Error tracking | Sentry | ✅ free tier | at scale |

> ⚠️ **Vercel Hobby forbids commercial use** — the moment you charge a user you
> must be on Pro ($20/mo). Budget it from day one.
> ⚠️ **Render free web services spin down after 15 min idle** — unusable for a
> live app; you need the always-on Starter ($7/mo).

---

## 8. Fixed deployment cost — your stack (Render + Vercel + domain)

| Item | Launch (lean) | At scale (100s of users) |
|---|---|---|
| Render Web Service (backend, always-on) | Starter **$7** | Standard **$25** |
| Render PostgreSQL + pgvector | Basic **$6** | Pro **$20–50** (RAM for vectors) |
| Vercel (frontend, commercial ⇒ Pro) | **$20** | **$20** + bandwidth |
| Domain (.com amortized) | **~$1.25** | ~$1.25 |
| Email (Resend) | $0 (free 3k) | $20 |
| Redis queue (Upstash) | $0 | $10 |
| Object storage (Cloudflare R2) | $0 | ~$5 |
| Error tracking (Sentry) | $0 | $26 |
| **Fixed total** | **~$34/mo** | **~$130–160/mo** |

---

## 9. Variable cost per user — recommended path

**Path: Spatius avatar + Azure Neural TTS (emotion) + Gemini, on-demand streaming.**

Per **avatar-minute of speech** (the metered resource):
- Azure Neural TTS: ~900 chars/min × $15/M = **$0.0135**
- Spatius motion: **$0.008**
- Gemini LLM: negligible (~$0.0003)
- **≈ $0.022 per avatar-minute**

Text/voice chat *without* the rendered avatar is nearly free (~$0.0004/answer),
so the strategy is: **default to cheap text+voice, meter the talking avatar.**

---

## 10. Recommended pricing & plans

Avatar minutes are the cost, so plans are gated on **avatar minutes/month**.
Text chat, uploads, and focus monitoring are effectively free to serve.

| Plan | Price/mo | Avatar min/mo | Your variable cost | Gross margin* |
|---|---|---|---|---|
| **Free** (funnel) | $0 | 30 | ~$0.70 | — (acquisition) |
| **Student** | **$9.99** | 150 | ~$3.30 | **~60%** |
| **Pro** | **$19.99** | 500 | ~$11.00 | **~40%** |

\* after Stripe (2.9% + $0.30). Add an **annual plan at ~2 months free**
($99/yr Student) to boost cash flow and retention.

**Why $9.99 Student is the anchor:** it's within student willingness-to-pay,
clears variable cost + Stripe with ~60% margin, and the 150-min cap (~12
sessions) protects you from runaway avatar bills. Over-cap users either upgrade
to Pro or buy add-on minute packs (e.g. $3 / 100 min).

---

## 11. Break-even & example P&L (blended ~$11 ARPU)

Assume blended revenue ~$11/paying user, blended variable ~$3.50, Stripe ~$0.60
⇒ **contribution ≈ $6.9/paying user/mo**.

| Paying users | Revenue | Variable | Fixed | **Profit/mo** |
|---|---|---|---|---|
| **Break-even** | ~7–10 | — | ~$50 | **$0** |
| 50 | ~$550 | ~$205 | ~$50 | **~$295** |
| 200 | ~$2,200 | ~$820 | ~$110 | **~$1,270** |
| 1,000 | ~$11,000 | ~$4,100 | ~$200 | **~$6,700** |

Free users are the main uncapped risk: hold their avatar cap tight (≤30 min) so
a large free base (e.g. 10× paying) stays a manageable ~$0.70 each.

**Verdict:** With Render+Vercel, the Spatius+Azure path, on-demand streaming,
and metered avatar minutes, the project **breaks even at ~7–10 paying users and
carries healthy 40–60% margins.** It is sustainable — the ANAM path is not.

---

## Sources
- [Spatius pricing](https://www.spatius.ai/pricing/)
- [Spatius — avatar pricing comparison (2026)](https://www.spatius.ai/blog/compare-pricing-leading-ai-avatar-services-2026/)
- [Spatius — BYO LLM & TTS avatar APIs](https://www.spatius.ai/blog/best-ai-avatar-apis-byo-llm-tts-2026/)
- [Anam pricing](https://anam.ai/pricing)
- [Anam pricing explained (2026)](https://selviaai.com/anam-pricing-explained)
- [Gemini API pricing 2026](https://tokenmix.ai/blog/gemini-api-pricing)
- [Deepgram Aura TTS pricing 2026](https://texttolab.com/blog/deepgram-pricing)
- [ElevenLabs pricing 2026](https://texttolab.com/blog/elevenlabs-pricing)
- [Render pricing 2026](https://render.com/pricing)
- [Vercel pricing 2026](https://vercel.com/pricing)
