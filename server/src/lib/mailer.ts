import { env } from '../config/env';
import { logger } from './logger';

/**
 * Splits a MAIL_FROM value like `"Buddyy <no-reply@buddyy.app>"` (or a bare
 * address) into the { name, email } shape Brevo's API expects.
 */
function parseFrom(from: string): { email: string; name?: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || undefined, email: match[2].trim() };
  return { email: from.trim() };
}

/**
 * Transactional email.
 *
 * - If BREVO_API_KEY is set, sends via the Brevo HTTP API (no SDK dependency —
 *   just a fetch). MAIL_FROM must use a sender address verified in your Brevo
 *   account. Swapping to SES/Postmark later is a one-function change.
 * - Otherwise (development) it logs the message to the console so you can grab
 *   verification / reset links locally.
 */
export async function sendMail(to: string, subject: string, body: string): Promise<void> {
  if (env.BREVO_API_KEY) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: parseFrom(env.MAIL_FROM),
        to: [{ email: to }],
        subject,
        // `body` is plain text/links today; wrap so it renders in HTML clients.
        htmlContent: `<div style="font-family:system-ui,sans-serif;line-height:1.5">${body.replace(
          /\n/g,
          '<br>',
        )}</div>`,
        textContent: body,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error('Email send failed', { to, subject, status: res.status, detail });
      throw new Error(`Email provider returned ${res.status}`);
    }
    logger.info('Email sent', { to, subject });
    return;
  }

  // Dev fallback: no provider configured.
  logger.info('Email (dev, not sent)', { to, subject });
  // eslint-disable-next-line no-console
  console.log(
    `\n──────── EMAIL (dev) ────────\nTo:      ${to}\nSubject: ${subject}\n\n${body}\n─────────────────────────────\n`,
  );
}
