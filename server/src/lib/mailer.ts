import { env } from '../config/env';
import { logger } from './logger';

/**
 * Transactional email.
 *
 * - If RESEND_API_KEY is set, sends via the Resend HTTP API (no SDK dependency —
 *   just a fetch). Works with any Resend account; set MAIL_FROM to a verified
 *   sender/domain. Swapping to SES/Postmark later is a one-function change.
 * - Otherwise (development) it logs the message to the console so you can grab
 *   verification / reset links locally.
 */
export async function sendMail(to: string, subject: string, body: string): Promise<void> {
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to,
        subject,
        // `body` is plain text/links today; wrap so it renders in HTML clients.
        html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">${body.replace(
          /\n/g,
          '<br>',
        )}</div>`,
        text: body,
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
