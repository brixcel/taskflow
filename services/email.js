/**
 * Email service — wraps Nodemailer for transactional email delivery.
 *
 * In production (NODE_ENV !== 'development') it requires:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  — SMTP credentials
 *   EMAIL_FROM                                   — "From" address, e.g. "TaskFlow <no-reply@example.com>"
 *   APP_URL                                      — base URL used to build reset links
 *
 * In development it skips real delivery and prints the reset link to the console
 * so you can test the flow without an email account.
 *
 * The module exports a single function:
 *   sendPasswordResetEmail(to, resetToken) → Promise<void>
 */

'use strict';

const nodemailer = require('nodemailer');

// ─── Build transporter ────────────────────────────────────────────────────────
//
// We create the transporter lazily (on first send) so that a missing env var
// doesn't crash the process at startup — the startup check in Phase 7 will
// handle that. For now, we validate at call time and throw a clear error.

function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      'Email service is not configured. ' +
      'Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS environment variables.'
    );
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465, // TLS on 465, STARTTLS otherwise
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

// ─── sendPasswordResetEmail ───────────────────────────────────────────────────

/**
 * Send a password-reset link to the given address.
 *
 * @param {string} to         - Recipient email address.
 * @param {string} resetToken - The raw (unhashed) token to embed in the link.
 */
async function sendPasswordResetEmail(to, resetToken) {
  const appUrl    = process.env.APP_URL || 'http://localhost:5173';
  const resetLink = `${appUrl}/reset-password?token=${resetToken}`;
  const from      = process.env.EMAIL_FROM || 'TaskFlow <no-reply@taskflow.app>';

  // ── Development: console-log only, skip real delivery ────────────────────
  if (process.env.NODE_ENV !== 'production') {
    console.log('\n─────────────────────────────────────────────');
    console.log('  [DEV] Password reset email (not sent)');
    console.log(`  To:   ${to}`);
    console.log(`  Link: ${resetLink}`);
    console.log('─────────────────────────────────────────────\n');
    return;
  }

  // ── Production: send via SMTP ─────────────────────────────────────────────
  const transporter = createTransporter();

  await transporter.sendMail({
    from,
    to,
    subject: 'Reset your TaskFlow password',
    text: [
      'You requested a password reset for your TaskFlow account.',
      '',
      'Click the link below to choose a new password. This link expires in 1 hour.',
      '',
      resetLink,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:8px">Reset your password</h2>
        <p style="color:#555;margin-bottom:24px">
          You requested a password reset for your TaskFlow account.
          Click the button below to choose a new password.
          This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${resetLink}"
           style="display:inline-block;padding:10px 20px;background:#171717;color:#fff;
                  border-radius:100px;text-decoration:none;font-size:14px;font-weight:500">
          Reset password
        </a>
        <p style="color:#888;font-size:12px;margin-top:24px">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

module.exports = { sendPasswordResetEmail };
