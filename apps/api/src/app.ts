import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { env } from './config/env.js';
import { registerErrorHandler } from './shared/http/error-handler.js';
import { authRoutes } from './modules/auth/http/auth.routes.js';
import { organizationRoutes } from './modules/organizations/http/organization.routes.js';
import { professionalRoutes } from './modules/professionals/http/professional.routes.js';
import { patientRoutes } from './modules/patients/http/patient.routes.js';
import { appointmentRoutes } from './modules/appointments/http/appointment.routes.js';
import { notificationRoutes } from './modules/notifications/http/notification.routes.js';
import { invoiceRoutes } from './modules/invoicing/http/invoice.routes.js';
import { publicRoutes } from './modules/public/http/public.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'warn',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
    },
  });

  await app.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : [env.WEB_APP_URL],
    credentials: true,
  });

  await app.register(jwt, { secret: env.JWT_SECRET });

  registerErrorHandler(app);

  app.get('/health', async () => ({ status: 'ok', provider: env.NOTIFICATION_PROVIDER }));

  // Each module registers its own routes. Adding a feature means adding a
  // folder and one line here, never editing a central router file.
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(organizationRoutes, { prefix: '/api' });
  await app.register(professionalRoutes, { prefix: '/api' });
  await app.register(patientRoutes, { prefix: '/api' });
  await app.register(appointmentRoutes, { prefix: '/api' });
  await app.register(notificationRoutes, { prefix: '/api' });
  await app.register(invoiceRoutes, { prefix: '/api' });
  await app.register(publicRoutes, { prefix: '/api' });

  return app;
}
