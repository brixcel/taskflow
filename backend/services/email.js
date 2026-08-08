/**
 * Email service — supports Resend API, Nodemailer SMTP, and dev fallback logging.
 *
 * Delivery strategy (evaluated in order):
 *   1. NODE_ENV=test → always console-log (never send), preserving Jest isolation.
 *   2. RESEND_API_KEY or EMAIL_API_KEY present → sends via Resend REST API (https://api.resend.com/emails).
 *   3. SMTP_HOST + SMTP_USER + SMTP_PASS present → sends via Nodemailer SMTP.
 *   4. Otherwise → falls back to console-logging the link (local dev mode).
 *
 * Env vars:
 *   RESEND_API_KEY / EMAIL_API_KEY - API key for Resend transactional email API
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS - Standard SMTP credentials
 *   EMAIL_FROM - Sender header, e.g. "TaskFlow <onboarding@resend.dev>" or "TaskFlow <no-reply@taskflow.app>"
 *   APP_URL - Base frontend URL, e.g. http://localhost:5173
 *
 * Exports:
 *   sendPasswordResetEmail(to, resetToken)  → Promise<void>
 *   sendVerificationEmail(to, verifyToken)  → Promise<void>
 */

'use strict';

const nodemailer = require('nodemailer');
const https = require('https');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when Resend API key is present in environment. */
function resendConfigured() {
  return Boolean(process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY);
}

/** Returns true when all three SMTP credentials are present in the environment and not placeholders. */
function smtpConfigured() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return false;
  if (SMTP_USER.includes('placeholder') || SMTP_PASS.includes('placeholder')) return false;
  return true;
}

/** Build a Nodemailer transporter from env vars. */
function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  const port   = parseInt(SMTP_PORT || '587', 10);
  const secure = port === 465;

  return nodemailer.createTransport({
    host:   SMTP_HOST,
    port,
    secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/**
 * Send email via Resend API (HTTP POST to api.resend.com/emails).
 */
async function sendViaResend({ from, to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY;
  const payload = JSON.stringify({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
    html,
  });

  if (typeof fetch === 'function') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: payload,
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(`Resend API error (${res.status}): ${errJson.message || res.statusText}`);
    }
    return;
  }

  // Node HTTPS fallback if global fetch is unavailable
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Resend API error (${res.statusCode}): ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Dispatch email using configured provider (Resend API -> SMTP -> Dev fallback).
 */
async function dispatchEmail({ from, to, subject, text, html, linkType, link }) {
  if (process.env.NODE_ENV === 'test') {
    logFallback(linkType, to, link);
    return;
  }

  if (resendConfigured()) {
    try {
      await sendViaResend({ from, to, subject, text, html });
      return;
    } catch (err) {
      console.warn(`\n⚠️  [Email Service] Resend API could not deliver email to ${to}: ${err.message}`);
      console.warn(`    (Note: Resend onboarding@resend.dev only allows sending to the account owner's email).`);
      console.warn(`    Falling back to console-logging the link for local testing:\n`);
      logFallback(linkType, to, link);
      return;
    }
  }

  if (smtpConfigured()) {
    try {
      const transporter = createTransporter();
      await transporter.sendMail({ from, to, subject, text, html });
      return;
    } catch (err) {
      console.warn(`\n⚠️  [Email Service] SMTP delivery failed to ${to}: ${err.message}`);
      console.warn(`    Falling back to console-logging the link for local testing:\n`);
      logFallback(linkType, to, link);
      return;
    }
  }

  logFallback(linkType, to, link);
}

/** Console-log fallback — prints the link so you can click it manually. */
function logFallback(type, to, link) {
  console.log('\n─────────────────────────────────────────────');
  console.log(`  [DEV] ${type} (not sent — no API key or SMTP set)`);
  console.log(`  To:   ${to}`);
  console.log(`  Link: ${link}`);
  console.log('─────────────────────────────────────────────\n');
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
  const from      = process.env.EMAIL_FROM || 'TaskFlow <onboarding@resend.dev>';

  await dispatchEmail({
    from,
    to,
    subject: 'Reset your TaskFlow password',
    linkType: 'Password reset email',
    link: resetLink,
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

// ─── sendVerificationEmail ────────────────────────────────────────────────────

/**
 * Send an email-verification link to the given address.
 *
 * @param {string} to           - Recipient email address.
 * @param {string} verifyToken  - The raw (unhashed) token to embed in the link.
 */
async function sendVerificationEmail(to, verifyToken) {
  const appUrl     = process.env.APP_URL || 'http://localhost:5173';
  const verifyLink = `${appUrl}/verify-email?token=${verifyToken}`;
  const from       = process.env.EMAIL_FROM || 'TaskFlow <onboarding@resend.dev>';

  await dispatchEmail({
    from,
    to,
    subject: 'Verify your TaskFlow email address',
    linkType: 'Email verification link',
    link: verifyLink,
    text: [
      'Thanks for signing up for TaskFlow!',
      '',
      'Click the link below to verify your email address. This link expires in 24 hours.',
      '',
      verifyLink,
      '',
      'If you did not create a TaskFlow account, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:8px">Verify your email address</h2>
        <p style="color:#555;margin-bottom:24px">
          Thanks for signing up for TaskFlow!
          Click the button below to verify your email address.
          This link expires in <strong>24 hours</strong>.
        </p>
        <a href="${verifyLink}"
           style="display:inline-block;padding:10px 20px;background:#171717;color:#fff;
                  border-radius:100px;text-decoration:none;font-size:14px;font-weight:500">
          Verify email address
        </a>
        <p style="color:#888;font-size:12px;margin-top:24px">
          If you didn't create a TaskFlow account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

module.exports = { sendPasswordResetEmail, sendVerificationEmail };

