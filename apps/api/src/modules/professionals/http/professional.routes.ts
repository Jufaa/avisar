import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../shared/prisma.js';
import { authOf, requireAuth } from '../../../shared/http/auth.js';
import { NotFoundError } from '../../../shared/errors.js';
import { PrismaProfessionalRepository } from '../infrastructure/prisma-professional.repository.js';
import { archiveProfessional } from '../application/archive-professional.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const createBody = z.object({
  fullName: z.string().trim().min(2, 'Enter the professional name'),
  specialty: z.string().trim().max(80).nullish(),
  defaultDurationMin: z.coerce.number().int().min(5).max(480).default(30),
  color: z.string().regex(HEX_COLOR, 'Use a hex color like #1F6E4E').optional(),
});

const updateBody = createBody.partial().extend({
  active: z.boolean().optional(),
});

const listQuery = z.object({
  includeInactive: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => value === 'true'),
});

export async function professionalRoutes(app: FastifyInstance): Promise<void> {
  const repository = new PrismaProfessionalRepository(prisma);

  app.addHook('preHandler', requireAuth);

  app.get('/professionals', async (request) => {
    const { organizationId } = authOf(request);
    const query = listQuery.parse(request.query);
    return repository.list(organizationId, { includeInactive: query.includeInactive });
  });

  app.get<{ Params: { id: string } }>('/professionals/:id', async (request) => {
    const { organizationId } = authOf(request);
    const found = await repository.findById(organizationId, request.params.id);
    if (!found) throw new NotFoundError('Professional');
    return found;
  });

  app.post('/professionals', async (request, reply) => {
    const { organizationId } = authOf(request);
    const body = createBody.parse(request.body);
    const created = await repository.create(organizationId, body);
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { id: string } }>('/professionals/:id', async (request) => {
    const { organizationId } = authOf(request);
    const body = updateBody.parse(request.body);
    const found = await repository.findById(organizationId, request.params.id);
    if (!found) throw new NotFoundError('Professional');
    return repository.update(organizationId, request.params.id, body);
  });

  app.delete<{ Params: { id: string } }>('/professionals/:id', async (request) => {
    const { organizationId } = authOf(request);
    return archiveProfessional(organizationId, request.params.id, repository);
  });
}
