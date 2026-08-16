const crypto = require('crypto');
const prisma = require('../prisma');

const VALID_WEBHOOK_EVENTS = [
  'task.created',
  'task.updated',
  'task.completed',
  'task.assigned',
  'comment.created',
  'project.created',
  'ping',
];

/**
 * Generates a high-entropy webhook signing secret
 * Format: whsec_<48 hex chars>
 */
function generateWebhookSecret() {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Signs a webhook payload using HMAC-SHA256
 * Format: t=<unix_timestamp_sec>,v1=<hex_hmac>
 */
function signWebhookPayload(secret, payloadString, timestamp = Math.floor(Date.now() / 1000)) {
  const dataToSign = `${timestamp}.${payloadString}`;
  const hmac = crypto.createHmac('sha256', secret).update(dataToSign).digest('hex');
  return {
    timestamp,
    signatureHeader: `t=${timestamp},v1=${hmac}`,
  };
}

/**
 * Verifies an incoming webhook signature header
 */
function verifyWebhookSignature(signatureHeader, secret, payloadString, toleranceSec = 300) {
  if (!signatureHeader || !secret || !payloadString) return false;

  const parts = signatureHeader.split(',');
  let t = null;
  let v1 = null;

  for (const part of parts) {
    const [k, v] = part.trim().split('=');
    if (k === 't') t = parseInt(v, 10);
    if (k === 'v1') v1 = v;
  }

  if (!t || !v1) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > toleranceSec) {
    return false; // Expired or future timestamp
  }

  const expectedHmac = crypto.createHmac('sha256', secret).update(`${t}.${payloadString}`).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expectedHmac, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Delivers a single payload to a specific webhook endpoint and records the delivery
 */
async function deliverWebhook({ webhook, event, data, prismaInstance = prisma }) {
  const deliveryId = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);

  const payloadObject = {
    id: `evt_${crypto.randomUUID()}`,
    event,
    timestamp: new Date().toISOString(),
    teamId: webhook.teamId,
    data,
  };

  const payloadString = JSON.stringify(payloadObject);
  const { signatureHeader } = signWebhookPayload(webhook.secret, payloadString, timestamp);

  const startTime = Date.now();
  let statusCode = null;
  let responseBody = null;
  let status = 'failed';
  let errorMsg = null;

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TaskFlow-Webhook-Delivery/2.0',
        'X-TaskFlow-Event': event,
        'X-TaskFlow-Delivery': deliveryId,
        'X-TaskFlow-Signature': signatureHeader,
      },
      body: payloadString,
      signal: AbortSignal.timeout(8000),
    });

    const durationMs = Date.now() - startTime;
    statusCode = res.status;
    const textResponse = await res.text().catch(() => '');
    responseBody = textResponse.slice(0, 1000);

    if (statusCode >= 200 && statusCode < 300) {
      status = 'success';
    } else {
      status = 'failed';
      errorMsg = `Endpoint returned HTTP status ${statusCode}`;
    }

    const delivery = await prismaInstance.webhookDelivery.create({
      data: {
        id: deliveryId,
        webhookId: webhook.id,
        event,
        payload: payloadObject,
        statusCode,
        responseBody,
        durationMs,
        status,
        error: errorMsg,
        deliveredAt: new Date(),
      },
    });

    return delivery;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    errorMsg = err.message || 'Connection error';

    const delivery = await prismaInstance.webhookDelivery.create({
      data: {
        id: deliveryId,
        webhookId: webhook.id,
        event,
        payload: payloadObject,
        statusCode: null,
        responseBody: null,
        durationMs,
        status: 'failed',
        error: errorMsg,
        deliveredAt: new Date(),
      },
    });

    return delivery;
  }
}

/**
 * Dispatches an event to all active webhooks subscribed to that event in a team
 */
async function dispatchWebhookEvent(teamId, event, data, { prismaInstance = prisma } = {}) {
  try {
    const webhooks = await prismaInstance.webhook.findMany({
      where: {
        teamId,
        isActive: true,
      },
    });

    const matchingWebhooks = webhooks.filter(
      (wh) => wh.events.includes('*') || wh.events.includes(event)
    );

    if (matchingWebhooks.length === 0) return [];

    const deliveryPromises = matchingWebhooks.map((webhook) =>
      deliverWebhook({ webhook, event, data, prismaInstance })
    );

    return await Promise.allSettled(deliveryPromises);
  } catch (err) {
    // Webhook dispatch failures must not break application logic
    return [];
  }
}

/**
 * Sends a test 'ping' event to a webhook endpoint
 */
async function sendWebhookPing(webhookId, teamId, { prismaInstance = prisma } = {}) {
  const webhook = await prismaInstance.webhook.findFirst({
    where: { id: webhookId, teamId },
  });

  if (!webhook) {
    throw new Error('Webhook not found in this team');
  }

  const pingData = {
    message: 'Webhook ping test successful!',
    webhookId: webhook.id,
    webhookName: webhook.name,
    events: webhook.events,
    timestamp: new Date().toISOString(),
  };

  return await deliverWebhook({
    webhook,
    event: 'ping',
    data: pingData,
    prismaInstance,
  });
}

module.exports = {
  VALID_WEBHOOK_EVENTS,
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
  deliverWebhook,
  dispatchWebhookEvent,
  sendWebhookPing,
};
