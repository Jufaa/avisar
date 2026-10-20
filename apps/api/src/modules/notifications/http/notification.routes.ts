import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../../config/env.js';
import { prisma } from '../../../shared/prisma.js';
import { authOf, requireAuth } from '../../../shared/http/auth.js';
import { AppError, ValidationError } from '../../../shared/errors.js';
import { PrismaNotificationRepository } from '../infrastructure/prisma-notification.repository.js';
import { notificationProvider } from '../infrastructure/providers/index.js';
import { unknownVariables } from '../domain/render-template.js';

const logQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createRuleBody = z.object({
  hoursBefore: z.coerce.number().int().min(1).max(336),
  templateId: z.string().uuid(),
  professionalId: z.string().uuid().nullish(),
});

const updateRuleBody = z.object({
  hoursBefore: z.coerce.number().int().min(1).max(336).optional(),
  enabled: z.boolean().optional(),
  templateId: z.string().uuid().optional(),
});

const updateTemplateBody = z.object({
  name: z.string().trim().min(2).optional(),
  body: z.string().trim().min(10, 'The message is too short').max(1500).optional(),
});

function rejectSenderManagement(): never {
  throw new AppError(403, 'CENTRAL_WHATSAPP_MANAGED',
    'Avisar gestiona el envío de recordatorios. No es necesario conectar un número ni enviar mensajes de prueba.');
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const repository = new PrismaNotificationRepository(prisma);

  app.addHook('preHandler', requireAuth);

  // --- provider status -----------------------------------------------------

  app.get('/notifications/provider', async () => {
    const provider = notificationProvider();
    return {
      name: provider.name,
      live: provider.live,
      messageTemplate:
        provider.name === 'meta' && env.META_TEMPLATE_NAME
          ? { name: env.META_TEMPLATE_NAME, language: env.META_TEMPLATE_LANGUAGE }
          : provider.name === 'twilio' && env.TWILIO_CONTENT_SID
            ? { name: env.TWILIO_CONTENT_SID, language: null }
            : null,
      whatsapp: {
        connected: provider.live,
        displayPhoneNumber: null,
        signupAvailable: false,
      },
      // Surfaced in settings so the user always knows whether messages are
      // actually leaving the building.
      description:
        provider.name === 'unavailable'
          ? 'El servicio de WhatsApp de Avisar está pendiente de configuración.'
          : provider.live
          ? 'Los mensajes se envían por WhatsApp.'
          : 'Modo de prueba: los mensajes se muestran en el servidor y no llegan al paciente.',
    };
  });

  app.post('/notifications/whatsapp/signup', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async () => rejectSenderManagement());

  app.post('/notifications/whatsapp/complete', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async () => rejectSenderManagement());

  app.delete('/notifications/whatsapp/connection', async () => rejectSenderManagement());

  // --- log -----------------------------------------------------------------

  app.get('/notifications', async (request) => {
    const { organizationId } = authOf(request);
    const query = logQuery.parse(request.query);
    return repository.listLog(organizationId, query);
  });

  // --- rules ---------------------------------------------------------------

  app.get('/reminder-rules', async (request) => {
    const { organizationId } = authOf(request);
    return repository.listRules(organizationId);
  });

  app.post('/reminder-rules', async (request, reply) => {
    const { organizationId } = authOf(request);
    const body = createRuleBody.parse(request.body);
    const created = await repository.createRule(organizationId, {
      hoursBefore: body.hoursBefore,
      templateId: body.templateId,
      professionalId: body.professionalId ?? null,
    });
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { id: string } }>('/reminder-rules/:id', async (request) => {
    const { organizationId } = authOf(request);
    const body = updateRuleBody.parse(request.body);
    return repository.updateRule(organizationId, request.params.id, body);
  });

  app.delete<{ Params: { id: string } }>('/reminder-rules/:id', async (request, reply) => {
    const { organizationId } = authOf(request);
    await repository.deleteRule(organizationId, request.params.id);
    return reply.status(204).send();
  });

  // --- templates -----------------------------------------------------------

  app.get('/message-templates', async (request) => {
    const { organizationId } = authOf(request);
    return repository.listTemplates(organizationId);
  });

  app.patch<{ Params: { id: string } }>('/message-templates/:id', async (request) => {
    const { organizationId } = authOf(request);
    const body = updateTemplateBody.parse(request.body);

    if (body.body) {
      const unknown = unknownVariables(body.body);
      if (unknown.length > 0) {
        // Caught here rather than silently at send time, when the patient
        // would be the one reading `{telefono}` in their message.
        throw new ValidationError(
          `These variables do not exist: ${unknown.map((name) => `{${name}}`).join(', ')}`,
          { unknown },
        );
      }
    }

    return repository.updateTemplate(organizationId, request.params.id, body);
  });

  // --- test message --------------------------------------------------------

  app.post('/notifications/test', async () => rejectSenderManagement());
}
