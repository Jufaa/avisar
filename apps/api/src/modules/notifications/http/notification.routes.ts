import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../shared/prisma.js';
import { authOf, requireAuth } from '../../../shared/http/auth.js';
import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { PrismaNotificationRepository } from '../infrastructure/prisma-notification.repository.js';
import { PrismaOrganizationRepository } from '../../organizations/infrastructure/prisma-organization.repository.js';
import { notificationProvider } from '../infrastructure/providers/index.js';
import { sendTestMessage } from '../application/send-test-message.js';
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

const testBody = z.object({
  phone: z.string().trim().min(6, 'Enter a WhatsApp number'),
  templateBody: z.string().trim().min(1).optional(),
});

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const repository = new PrismaNotificationRepository(prisma);
  const organizations = new PrismaOrganizationRepository(prisma);

  app.addHook('preHandler', requireAuth);

  // --- provider status -----------------------------------------------------

  app.get('/notifications/provider', async () => {
    const provider = notificationProvider();
    return {
      name: provider.name,
      live: provider.live,
      // Surfaced in settings so the user always knows whether messages are
      // actually leaving the building.
      description:
        provider.live
          ? 'Los mensajes se envían por WhatsApp.'
          : 'Modo de prueba: los mensajes se muestran en el servidor y no llegan al paciente.',
    };
  });

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

  app.post('/notifications/test', async (request) => {
    const { organizationId, sub } = authOf(request);
    const body = testBody.parse(request.body);

    const account = await organizations.findAccount(sub);
    if (!account) throw new NotFoundError('Account');

    let templateBody = body.templateBody;
    if (!templateBody) {
      const templates = await repository.listTemplates(organizationId);
      templateBody = templates.find((template) => template.kind === 'REMINDER')?.body;
      if (!templateBody) throw new NotFoundError('Reminder template');
    }

    return sendTestMessage(
      {
        phone: body.phone,
        templateBody,
        organizationName: account.organization.name,
        timezone: account.organization.timezone,
        userName: account.fullName,
      },
      notificationProvider(),
    );
  });
}
