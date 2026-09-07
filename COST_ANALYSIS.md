# Buddyy — Cost Analysis & Pricing

_Prepared 2026-09-02. All third-party prices are as published on that date and
will drift — re-verify (Google TTS, Spatius, Gemini, Vercel, Render, Supabase)
before committing to a plan._

This models what Buddyy actually costs to run on its **current stack** —
**Spatius avatar + Google Cloud TTS voice + Google Gemini**, deployed on
**Vercel (frontend) + Render (backend) + Supabase (Postgres/pgvector/storage)**
— and derives a subscription plan that is profitable at small scale.

---

## The one principle that governs everything

There are **three different clocks**, and only one of them costs you money:

| Clock | Typical minutes/mo | Who pays | Cost driver |
|---|---|---|---|
| **Study / monitoring time** (app open, focus tracking) | ~1,500–2,000 | **client-side → $0** | the student's own device |
| **Avatar speaking time** (Spatius + TTS) | ~130 | **you** | the entire bill |
| **Chat / LLM** (Gemini) | ~130 questions | you, trivially | ~$0.10/mo |

**Focus detection runs entirely on-device** (MediaPipe + Web Audio in the
browser), so studying and monitoring cost you nothing regardless of how long a
student uses the app. **The only metered cost is the minutes the avatar
actually speaks.** Every pricing and design decision below follows from this.

> ⚠️ Never send webcam/mic to a cloud vision/audio model. At ~2,000 study
> min/user/mo, cloud CV (~$0.05–0.10/min) would cost **$100–300 per user per
> month** — 10–30× the subscription price. On-device is both far cheaper and a
> privacy selling point ("your camera never leaves your device").

---

## 1. Realistic usage assumptions (grounded, not inflated)

| Assumption | Value | Basis |
|---|---|---|
| Total study time | ~1,800–2,800 min/mo | objective time-use studies (~7–11 hrs/week) |
| **In-app study time (plan around this)** | **~1,500–2,000 min/mo** | app captures ~30–60% of study time |
| LLM adoption among students | ~85–90% have used AI; ~50–60% regularly | 2025–2026 surveys |
| LLM questions per session | ~8–15 | typical active use |
| **LLM questions / mo** | **~130** | ~16 sessions × partial AI use |
| **Avatar speaking min / mo (typical)** | **~130** | ~0.9 min spoken per answer |

---

## 2. Unit prices (as of 2026-09-02)

| Component | Provider / plan | Price |
|---|---|---|
| Avatar motion | **Spatius** | **$0.008 / min** |
| Voice / TTS | **Google Cloud TTS — Neural2** | **$16 / 1M chars** (~$0.0125 / spoken min) |
| Voice / TTS (cheaper lever) | Google Cloud TTS — Standard | $4 / 1M chars (~$0.0031 / min) |
| Chat LLM | Google Gemini Flash-Lite | $0.10 / M in · $0.40 / M out (~$0.0004 / answer) |
| Embeddings | Gemini Embedding | one-time at upload (pennies) |
| Focus detection | MediaPipe + Web Audio (client-side) | **$0 — never bills** |
| Payments | Stripe | 2.9% + $0.30 per charge |

**Blended cost per avatar-speaking-minute ≈ $0.021** (Spatius $0.008 + Neural2
TTS $0.0125 + Gemini ~$0.0004).

Free tiers useful during dev/pilot: **Google TTS 1M chars/mo free**, **Spatius
Free 100 min/mo**, Gemini free tier, Supabase/Vercel free tiers.

---

## 3. Variable cost per user / month

| User profile | Avatar min/mo | Spatius | Google TTS | Gemini | **Total / user** |
|---|---|---|---|---|---|
| Light | ~60 | $0.48 | $0.75 | $0.05 | **~$1.28** |
| **Typical student** | **~130** | $1.04 | $1.63 | $0.10 | **~$2.77** |
| Student cap | 150 | $1.20 | $1.88 | $0.06 | ~$3.15 |
| Heavy / Pro | ~400 | $3.20 | $5.00 | $0.20 | **~$8.40** |
| Pro cap | 500 | $4.00 | $6.25 | $0.20 | ~$10.45 |

> Note: **TTS costs more than the avatar motion itself.** Serving free-tier
> users with Google **Standard** voices (75% cheaper) is a meaningful lever.

---

## 4. Fixed hosting / deployment (monthly)

| Item | Launch (lean) | At scale (100s–1k users) |
|---|---|---|
| Vercel Pro (frontend — **required once you charge**) | $20 | $20 + bandwidth |
| Render (Express backend, always-on) | Starter $7 | Standard $25 |
| Supabase (Postgres + pgvector + storage + auth) | **Free** | Pro $25 (+usage) |
| Transactional email (Resend) | $0 (3k/mo) | $20 |
| Error tracking (Sentry) | $0 | $26 |
| Domain (amortized) | ~$1 | ~$1 |
| **Fixed total** | **~$28/mo** | **~$117/mo** |

> ⚠️ **Vercel Hobby forbids commercial use** — must be Pro ($20) the moment you
> charge. **Render free tier spins down** after 15 min idle — needs the $7
> always-on Starter.

---

## 5. Recommended subscription plan

The key move: **make the avatar voice the paid feature.** Free users get
unlimited text chat + focus monitoring (which cost ~$0 to serve), so a large
free base can't hurt you — and the talking tutor becomes the upsell.

| Plan | Price/mo | What they get | Your cost | **Margin (after Stripe)** |
|---|---|---|---|---|
| **Free** (funnel) | $0 | Unlimited grounded text chat + focus monitoring + 10-min avatar trial | ~$0.10 | acquisition (near-zero risk) |
| **Student** ⭐ | **$9.99** | Everything + **150 avatar-min** + Neural2 voice | ~$2.77–3.15 | **~63%** |
| **Pro** | **$19.99** | Everything + **500 avatar-min** + advanced focus analytics | ~$8.40–10.45 | **~44%** |

**Add-ons:** $3 / 100 extra avatar-min · **Annual Student $99/yr** (2 months
free — better cash flow + retention).

**Why it works:** a typical student's natural usage (~130 avatar-min) lands just
under the 150-min Student cap, so $9.99 covers the average user at ~63% margin,
while power users self-select into Pro or buy add-on packs.

---

## 6. Break-even & example P&L

Blended ~$11 ARPU, ~$3.50 variable, ~$0.60 Stripe ⇒ **contribution ≈ $6.9 per
paying user / mo.**

| Paying users | Revenue | Variable | Fixed | **Profit / mo** |
|---|---|---|---|---|
| **~5** | ~$55 | ~$18 | ~$28 | **~break-even** |
| 50 | ~$550 | ~$175 | ~$40 | **~$335** |
| 200 | ~$2,200 | ~$700 | ~$117 | **~$1,380** |
| 500 | ~$5,500 | ~$1,750 | ~$150 | **~$3,600** |
| 1,000 | ~$11,000 | ~$3,500 | ~$200 | **~$7,300** |

---

## 7. Cost-control levers (in order of impact)

1. **Keep focus detection on-device** — the difference between $0 and bankruptcy
   at 2,000 study min/user. Non-negotiable.
2. **On-demand avatar streaming** — connect/stream only while the avatar is
   actually speaking; auto-disconnect when idle. Otherwise cost ~2.5×.
3. **Make voice optional per answer** — default quick lookups to text (free),
   reserve the avatar voice for explanations. Can cut avatar minutes 30–50%.
4. **Hard avatar-minute caps per plan** — the only metered resource; caps make
   cost predictable no matter how much a student studies.
5. **Standard voice for the free tier** — 75% cheaper TTS where quality matters
   least.
6. **Keep Gemini Flash-Lite** for chat — already near-free.

---

## 8. Complete cost inventory (everything that can bill you)

| Category | Service | Free during dev? | Paid trigger |
|---|---|---|---|
| Chat LLM | Google Gemini Flash-Lite | ✅ free tier | usage over free tier |
| Embeddings | Gemini Embedding | ✅ free tier | per upload |
| Avatar | Spatius (motion) | ✅ 100 free min/mo | per streamed minute |
| Voice/TTS | Google Cloud TTS | ✅ 1M chars/mo | per character |
| Focus monitoring | MediaPipe + Web Audio (client-side) | ✅ always free | — never bills |
| Backend host | Render Web Service | spins down when idle | always-on = $7/mo |
| Database + storage | Supabase (Postgres/pgvector/storage/auth) | ✅ free tier | Pro $25/mo |
| Frontend host | Vercel | Hobby free | **commercial ⇒ Pro $20/mo** |
| Domain | registrar | — | ~$12/yr (.com) |
| Email | Resend | ✅ 3k/mo free | over free tier |
| Payments | Stripe | — | 2.9% + $0.30 / charge |
| Error tracking | Sentry | ✅ free tier | at scale |

---

## 9. What still blocks charging money

The plan above is only real once these exist (none are built yet):

1. **Usage metering + avatar-minute caps** (enforced in code) — the guardrail
   the entire pricing model depends on. **#1 priority.**
2. **Stripe billing / subscriptions.**
3. **Migrate SQLite → Supabase Postgres + pgvector.**
4. **Cloud file storage** (Supabase Storage) — currently local disk.
5. **Production security** (`COOKIE_SECURE=true`, HTTPS, real secrets).
6. **Real transactional email** (currently logs to console).
7. **Privacy Policy + Terms + explicit camera/mic consent** — legally required
   for a webcam/mic product.

---

## Verdict

With focus detection on-device, avatar minutes capped, and the voice sold as the
paid feature, Buddyy **breaks even at ~5 paying users**, runs at **~$28/mo during
the pilot**, and carries **healthy 44–63% gross margins**, scaling to **~$7k/mo
profit at 1,000 paying users**. The economics are sound. The remaining work is
**billing/metering, the Supabase migration, and the legal/consent layer** — not
cost.

---

## Sources

- [Spatius pricing](https://www.spatius.ai/pricing/)
- [Spatius — BYO LLM & TTS avatar APIs](https://www.spatius.ai/blog/best-ai-avatar-apis-byo-llm-tts-2026/)
- [Google Cloud Text-to-Speech pricing](https://cloud.google.com/text-to-speech/pricing)
- [Gemini API pricing 2026](https://tokenmix.ai/blog/gemini-api-pricing)
- [Vercel pricing](https://vercel.com/pricing)
- [Render pricing](https://render.com/pricing)
- [Supabase pricing](https://supabase.com/pricing)
