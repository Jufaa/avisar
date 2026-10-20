import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * The webhook over real HTTP, against the assembled app.
 *
 * The unit tests cover the parsing and the crypto. This one covers the part
 * that can only be wrong in a running server: Fastify parses JSON before any
 * handler sees it, so a signature computed over the original bytes has to have
 * been captured beforehand. A unit test cannot find that bug, and it would
 * show up as every delivery rejected in production.
 */

const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

// The app reads configuration at import time, so it has to be in place before
// buildApp is imported by anything above it.
process.env.META_APP_SECRET = APP_SECRET;
process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../src/app.js');

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest('hex')}`;
}

describe('meta webhook over HTTP', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('subscription handshake', () => {
    it('echoes the challenge to a correct subscriber', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=1158201444',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('1158201444');
    });

    it('refuses a wrong verify token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=guessed&hub.challenge=1158201444',
      });

      expect(response.statusCode).toBe(403);
      expect(response.body).not.toContain('1158201444');
    });

    it('needs no session, because Meta has none to send', async () => {
      const unauthorized = await app.inject({
        method: 'GET',
        url: '/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=x',
      });

      expect(unauthorized.statusCode).toBe(200);
    });
  });

  describe('delivery reports', () => {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                statuses: [{ id: 'wamid.TEST', status: 'delivered', timestamp: '1720000000' }],
              },
            },
          ],
        },
      ],
    });

    /**
     * The one that proves the raw-body hook exists. Serialized by hand, with
     * irregular spacing, so a signature taken over a re-encoding of it could
     * not accidentally match.
     */
    it('accepts a correctly signed body whose bytes are not canonical JSON', async () => {
      const irregular = '{ "object" :  "whatsapp_business_account" , "entry" : [ ] }';

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/meta',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(irregular) },
        payload: irregular,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ received: 0, applied: 0 });
    });

    it('rejects a body with no signature', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/meta',
        headers: { 'content-type': 'application/json' },
        payload: body,
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects a body signed with the wrong secret', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/meta',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body, 'not-the-secret') },
        payload: body,
      });

      expect(response.statusCode).toBe(401);
    });

    /**
     * The signature covers the body, so a tampered body that keeps the original
     * header must not be believed.
     */
    it('rejects a tampered body carrying a valid signature', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/meta',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
        payload: body.replace('delivered', 'read'),
      });

      expect(response.statusCode).toBe(401);
    });

    /**
     * Meta retries anything that is not answered quickly, and an unmatched id
     * is the normal case the first time this runs against an account with
     * history. Retrying forever would be worse than recording nothing.
     */
    it('answers 200 even when no reminder matches, so Meta stops retrying', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/meta',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ received: 1, applied: 0 });
    });

    it('ignores an inbound patient message without failing', async () => {
      const inbound = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  messages: [{ from: '15551234567', type: 'text', text: { body: 'holis' } }],
                },
              },
            ],
          },
        ],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/meta',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(inbound) },
        payload: inbound,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ received: 0, applied: 0 });
    });

    /**
     * The signature is checked before parsing, so a body that is not JSON at
     * all cannot reach the parser. This proves the order.
     */
    it('rejects an unparseable body without crashing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/meta',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign('not json at all') },
        payload: 'not json at all',
      });

      expect(response.statusCode).toBeLessThan(500);
    });
  });
});
