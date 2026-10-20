import type { FastifyInstance } from 'fastify';
import { env } from '../../../config/env.js';
import { prisma } from '../../../shared/prisma.js';
import { parseDeliveryEvents } from '../domain/delivery-status.js';
import { verifyMetaSignature, verifySubscription } from '../domain/meta-signature.js';
import { PrismaNotificationRepository } from '../infrastructure/prisma-notification.repository.js';

/**
 * The provider's half of the conversation.
 *
 * Everything else in this project asks Meta something and waits for an answer.
 * This route is the one place Meta tells us something we could not have asked
 * synchronously: whether a message we already handed over actually reached a
 * phone. Without it, SENT means only "Meta took the request", and a reminder
 * that vanished looks exactly like one that arrived.
 */
export async function metaWebhookRoutes(app: FastifyInstance): Promise<void> {
  const repository = new PrismaNotificationRepository(prisma);

  /**
   * Meta's one-time subscription check. It calls with a challenge and expects
   * it echoed back, but only to whoever holds the verify token we chose.
   */
  app.get('/webhooks/meta', async (request, reply) => {
    const query = request.query as Record<string, unknown>;

    const challenge = verifySubscription(
      query['hub.mode'],
      env.META_WEBHOOK_VERIFY_TOKEN,
      query['hub.verify_token'],
      query['hub.challenge'],
    );

    if (challenge === null) return reply.code(403).send({ error: 'forbidden' });
    return reply.code(200).type('text/plain').send(challenge);
  });

  app.post('/webhooks/meta', async (request, reply) => {
    // Nothing is trusted here, not even the shape of the body. The signature is
    // checked over the raw bytes before anything is parsed, because parsing
    // first would mean acting on input from an unverified sender.
    if (!env.META_APP_SECRET) {
      request.log.error('meta webhook hit but META_APP_SECRET is not configured');
      return reply.code(503).send({ error: 'webhook not configured' });
    }

    const raw = request.rawBody;
    if (!raw) return reply.code(400).send({ error: 'unreadable body' });

    const signature = request.headers['x-hub-signature-256'];
    if (!verifyMetaSignature(raw, signature, env.META_APP_SECRET)) {
      request.log.warn({ signaturePresent: Boolean(signature) }, 'rejected meta webhook signature');
      return reply.code(401).send({ error: 'invalid signature' });
    }

    const events = parseDeliveryEvents(request.body);

    // Each report settles on its own. One unmatched id, which is what we see
    // the first time this runs against an account with history, must not stop
    // the rest from landing.
    const results = await Promise.all(
      events.map(async (event) => {
        try {
          return await repository.applyDeliveryEvent(event);
        } catch (error) {
          request.log.error({ error, messageId: event.providerMessageId }, 'failed to record delivery');
          return false;
        }
      }),
    );

    const applied = results.filter(Boolean).length;

    // Meta retries anything that is not answered quickly with a 2xx, so the
    // answer is always success even when nothing matched: the request was
    // understood, and there is nothing left to do about it.
    if (applied > 0) request.log.info({ applied, received: events.length }, 'delivery reports recorded');
    if (events.length > 0 && applied === 0) {
      request.log.info({ received: events.length }, 'delivery reports matched no reminder');
    }

    return reply.code(200).send({ received: events.length, applied });
  });
}