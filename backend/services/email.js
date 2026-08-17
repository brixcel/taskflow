/**
 * Email service — supports Brevo REST API, Resend API, Nodemailer SMTP, and dev fallback logging.
 *
 * Delivery strategy (evaluated in order):
 *   1. NODE_ENV=test → always console-log (never send), preserving Jest isolation.
 *   2. BREVO_API_KEY / SENDINBLUE_API_KEY present → sends via Brevo REST API (https://api.brevo.com/v3/smtp/email).
 *      (Recommended for Render — works over port 443 HTTPS, delivers to any recipient inbox).
 *   3. RESEND_API_KEY / EMAIL_API_KEY present → sends via Resend REST API (https://api.resend.com/emails).
 *   4. SMTP_HOST + SMTP_USER + SMTP_PASS present → sends via Nodemailer SMTP.
 *   5. Otherwise → falls back to console-logging the link (local dev mode).
 *
 * Env vars:
 *   BREVO_API_KEY / SENDINBLUE_API_KEY - API key for Brevo transactional email API
 *   RESEND_API_KEY / EMAIL_API_KEY     - API key for Resend transactional email API
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS - Standard SMTP credentials
 *   EMAIL_FROM                         - Sender header, e.g. "TaskFlow <brexcel14@gmail.com>"
 *   APP_URL                            - Base frontend URL, e.g. http://localhost:5173
 *
 * Exports:
 *   sendPasswordResetEmail(to, resetToken)  → Promise<void>
 *   sendVerificationEmail(to, verifyToken)  → Promise<void>
 */

'use strict';

const nodemailer = require('nodemailer');
const https = require('https');

// ─── Provider Configuration Checks ────────────────────────────────────────────

/** Returns true when Brevo API key is present in environment. */
function brevoConfigured() {
  return Boolean(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY);
}

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

// ─── SMTP Transporter ─────────────────────────────────────────────────────────

/** Build a Nodemailer transporter from env vars. */
function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  const port = parseInt(SMTP_PORT || '587', 10);
  const cleanPass = (SMTP_PASS || '').replace(/\s+/g, '');
  const isGmail = SMTP_HOST === 'smtp.gmail.com' || (SMTP_USER && SMTP_USER.endsWith('@gmail.com'));

  if (isGmail) {
    return nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: cleanPass },
      family: 4,
      connectionTimeout: 15000,
    });
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: cleanPass },
    family: 4,
    connectionTimeout: 10000,
  });
}

// ─── Brevo HTTP API Provider ──────────────────────────────────────────────────

/**
 * Send email via Brevo REST API (HTTPS POST to api.brevo.com/v3/smtp/email).
 * Delivers to any external email address using Brevo transactional email infrastructure.
 */
async function sendViaBrevo({ from, to, subject, text, html }) {
  const apiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;

  // Extract name and email from "SyncTask <email@domain.com>" or fallback
  let senderName = 'SyncTask';
  let senderEmail = 'brexcel14@gmail.com';

  if (from) {
    const match = from.match(/^([^<]+)<([^>]+)>$/);
    if (match) {
      senderName = match[1].trim();
      senderEmail = match[2].trim();
    } else if (from.includes('@')) {
      senderEmail = from.trim();
    }
  }

  // Safety fallback: if configured sender is the default unverified resend sandbox, use verified Brevo account email
  if (senderEmail.includes('resend.dev')) {
    senderEmail = process.env.BREVO_SENDER_EMAIL || 'brexcel14@gmail.com';
  }

  const recipientList = (Array.isArray(to) ? to : [to]).map((addr) => ({ email: addr }));

  const payload = JSON.stringify({
    sender: { name: senderName, email: senderEmail },
    to: recipientList,
    subject,
    htmlContent: html,
    textContent: text,
  });

  if (typeof fetch === 'function') {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      body: payload,
    });

    const responseBody = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = responseBody.message || res.statusText || 'Unknown Brevo API error';
      const errCode = responseBody.code || res.status;
      throw new Error(`Brevo API error [${errCode}]: ${errMsg} (Status: ${res.status})`);
    }

    return responseBody;
  }

  // Node HTTPS fallback
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          'accept': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = { raw: rawData };
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const msg = parsed.message || rawData || res.statusMessage;
            reject(new Error(`Brevo API error (${res.statusCode}): ${msg}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Resend HTTP API Provider ─────────────────────────────────────────────────

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
    return await res.json().catch(() => ({}));
  }

  // Node HTTPS fallback
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Resend API error (${res.statusCode}): ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Dispatch Engine ──────────────────────────────────────────────────────────

/**
 * Dispatch email using configured provider (Brevo API -> Resend API -> SMTP -> Dev fallback).
 */
async function dispatchEmail({ from, to, subject, text, html, linkType, link }) {
  if (process.env.NODE_ENV === 'test') {
    logFallback(linkType, to, link);
    return;
  }

  // 1. Brevo HTTP API (Primary provider — reliable HTTPS port 443 delivery to all recipients)
  if (brevoConfigured()) {
    try {
      const result = await sendViaBrevo({ from, to, subject, text, html });
      console.log(`\n📧 [Email Service] Successfully delivered ${linkType} to ${to} via Brevo API (Message ID: ${result?.messageId || 'ok'})\n`);
      return;
    } catch (err) {
      console.error(`\n❌ [Email Service] Brevo API error delivering to ${to}: ${err.message}`);
      if (!resendConfigured() && !smtpConfigured()) {
        logFallback(linkType, to, link);
        return;
      }
    }
  }

  // 2. Resend API
  if (resendConfigured()) {
    try {
      await sendViaResend({ from, to, subject, text, html });
      console.log(`\n📧 [Email Service] Successfully sent ${linkType} to ${to} via Resend API\n`);
      return;
    } catch (err) {
      console.warn(`\n⚠️  [Email Service] Resend API could not deliver email to ${to}: ${err.message}`);
      console.warn(`    (Note: Resend onboarding@resend.dev only allows sending to the account owner's email).`);
      console.warn(`    To deliver to all users, verify your domain in Resend or configure Brevo.\n`);
      if (!smtpConfigured()) {
        logFallback(linkType, to, link);
        return;
      }
    }
  }

  // 3. SMTP
  if (smtpConfigured()) {
    try {
      const transporter = createTransporter();
      const info = await transporter.sendMail({ from, to, subject, text, html });
      console.log(`\n📧 [Email Service] Successfully sent ${linkType} to ${to} via SMTP (Message ID: ${info?.messageId || 'ok'})\n`);
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
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const resetLink = `${appUrl}/reset-password?token=${resetToken}`;
  const from = process.env.EMAIL_FROM || 'SyncTask <brexcel14@gmail.com>';

  await dispatchEmail({
    from,
    to,
    subject: 'Reset your SyncTask password',
    linkType: 'Password reset email',
    link: resetLink,
    text: [
      'You requested a password reset for your SyncTask account.',
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
          You requested a password reset for your SyncTask account.
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
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const verifyLink = `${appUrl}/verify-email?token=${verifyToken}`;
  const from = process.env.EMAIL_FROM || 'SyncTask <brexcel14@gmail.com>';

  await dispatchEmail({
    from,
    to,
    subject: 'Verify your SyncTask email address',
    linkType: 'Email verification link',
    link: verifyLink,
    text: [
      'Thanks for signing up for SyncTask!',
      '',
      'Click the link below to verify your email address. This link expires in 24 hours.',
      '',
      verifyLink,
      '',
      'If you did not create a SyncTask account, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:8px">Verify your email address</h2>
        <p style="color:#555;margin-bottom:24px">
          Thanks for signing up for SyncTask!
          Click the button below to verify your email address.
          This link expires in <strong>24 hours</strong>.
        </p>
        <a href="${verifyLink}"
           style="display:inline-block;padding:10px 20px;background:#171717;color:#fff;
                  border-radius:100px;text-decoration:none;font-size:14px;font-weight:500">
          Verify email address
        </a>
        <p style="color:#888;font-size:12px;margin-top:24px">
          If you didn't create a SyncTask account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}


module.exports = { sendPasswordResetEmail, sendVerificationEmail };
