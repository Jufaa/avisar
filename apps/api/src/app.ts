import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import jwt from '@fastify/jwt';
import { env } from './config/env.js';
import { registerErrorHandler } from './shared/http/error-handler.js';
import { TooManyRequestsError } from './shared/errors.js';
import { authRoutes } from './modules/auth/http/auth.routes.js';
import { organizationRoutes } from './modules/organizations/http/organization.routes.js';
import { professionalRoutes } from './modules/professionals/http/professional.routes.js';
import { patientRoutes } from './modules/patients/http/patient.routes.js';
import { appointmentRoutes } from './modules/appointments/http/appointment.routes.js';
import { notificationRoutes } from './modules/notifications/http/notification.routes.js';
import { invoiceRoutes } from './modules/invoicing/http/invoice.routes.js';
import { publicRoutes } from './modules/public/http/public.routes.js';
import { metaWebhookRoutes } from './modules/notifications/http/meta-webhook.routes.js';

/** Where this file sits once compiled, so the web build can be found next to it. */
const currentDir = dirname(fileURLToPath(import.meta.url));

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'warn',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
      // Never let a header carrying a bearer token reach the log files.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    // Nothing this API accepts is large. A patient, an appointment and an
    // invoice all fit in a few kilobytes, so a megabyte is already generous —
    // and it stops a single request from eating the process's memory.
    bodyLimit: 1_048_576,
    // Behind a proxy or load balancer the client address arrives in a header.
    // Without this every request looks like it comes from the proxy, and the
    // rate limiter would throttle every user as if they were one.
    trustProxy: env.NODE_ENV === 'production',
  });

  // Sensible security headers. This API answers JSON and never renders HTML,
  // so the content policy is locked all the way down rather than tuned.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        // The production client loads Meta's SDK and opens its signup dialog.
        scriptSrc: ["'self'", 'https://connect.facebook.net'],
        connectSrc: ["'self'", 'https://www.facebook.com', 'https://graph.facebook.com'],
        frameSrc: ['https://www.facebook.com', 'https://web.facebook.com'],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  await app.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : [env.WEB_APP_URL],
    credentials: true,
  });

  /**
   * A ceiling, not a policy.
   *
   * The endpoints that actually need protecting — signing in, and the patient's
   * public link — set their own far stricter budget. This one only exists so a
   * single address cannot hammer the whole API.
   */
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // The reminder job and the health check run in-process or from the
    // platform; throttling them would be self-harm.
    allowList: (request) => request.url === '/health',
    errorResponseBuilder: () => new TooManyRequestsError(),
  });

  await app.register(jwt, { secret: env.JWT_SECRET });

  /**
   * Keeps the exact bytes of a webhook body available to the handler.
   *
   * A signature is computed over what actually crossed the wire. Once Fastify
   * parses JSON, whitespace and unicode escapes are gone and the original is
   * unrecoverable — so the stream is teed here and the same buffer is handed
   * onward for normal parsing. Scoped to the one path that needs it, because
   * buffering every body in memory is a cost nothing else should pay.
   */
  const RAW_BODY_PATH = '/api/webhooks/meta';
  app.addHook('preParsing', async (request, _reply, payload) => {
    if (request.method !== 'POST' || request.url !== RAW_BODY_PATH) return payload;

    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    const raw = Buffer.concat(chunks);
    request.rawBody = raw;

    // Reading the original stream to the end is what makes the bytes
    // available, but it leaves nothing for the JSON parser that runs next.
    // Handing back a fresh stream carrying the same bytes is what keeps
    // `request.body` working — Fastify reads the parser input from here, not
    // from the stream we just drained.
    return Readable.from([raw]);
  });

  // Registered before the error handler, which needs `sendFile` to exist to
  // hand an unknown path back to the browser router.
  if (env.SERVE_WEB) {
    await app.register(fastifyStatic, {
      root: resolve(currentDir, '../../web/dist'),
      wildcard: false,
    });
  }

  registerErrorHandler(app, { serveWeb: env.SERVE_WEB });

  // Deliberately says nothing about how the service is configured. A health
  // check is read by load balancers, and by anyone who finds the URL.
  app.get('/health', async () => ({ status: 'ok' }));

  // Each module registers its own routes. Adding a feature means adding a
  // folder and one line here, never editing a central router file.
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(organizationRoutes, { prefix: '/api' });
  await app.register(professionalRoutes, { prefix: '/api' });
  await app.register(patientRoutes, { prefix: '/api' });
  await app.register(appointmentRoutes, { prefix: '/api' });
  await app.register(notificationRoutes, { prefix: '/api' });
  // The fake provider mints CAE numbers that do not exist. Not mounting the
  // routes removes the surface entirely, where a warning would only advise
  // against it while leaving it one request away.
  if (env.INVOICING_ENABLED) {
    await app.register(invoiceRoutes, { prefix: '/api' });
  }
  await app.register(publicRoutes, { prefix: '/api' });
  // Registered as its own module so the session guard the others install stays
  // in their scope. Meta has no session to send; the signature is the guard.
  await app.register(metaWebhookRoutes, { prefix: '/api' });

  return app;
}
