import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../shared/prisma.js';
import { authOf, requireAuth } from '../../../shared/http/auth.js';
import { NotFoundError } from '../../../shared/errors.js';
import { PrismaPatientRepository } from '../infrastructure/prisma-patient.repository.js';
import { createPatient } from '../application/create-patient.js';
import { updatePatient } from '../application/update-patient.js';
import { deletePatient } from '../application/delete-patient.js';

const createBody = z.object({
  fullName: z.string().trim().min(2, 'Enter the patient name'),
  phone: z.string().trim().min(6, 'Enter the WhatsApp number'),
  email: z.string().trim().email('Enter a valid email').nullish().or(z.literal('')),
  notes: z.string().trim().max(1000).nullish(),
  whatsappOptIn: z.boolean().optional(),
});

const updateBody = createBody.partial();

const listQuery = z.object({
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function patientRoutes(app: FastifyInstance): Promise<void> {
  const repository = new PrismaPatientRepository(prisma);

  app.addHook('preHandler', requireAuth);

  app.get('/patients', async (request) => {
    const { organizationId } = authOf(request);
    const query = listQuery.parse(request.query);
    return repository.list(organizationId, query);
  });

  app.get<{ Params: { id: string } }>('/patients/:id', async (request) => {
    const { organizationId } = authOf(request);
    const found = await repository.findById(organizationId, request.params.id);
    if (!found) throw new NotFoundError('Patient');
    return found;
  });

  app.post('/patients', async (request, reply) => {
    const { organizationId } = authOf(request);
    const body = createBody.parse(request.body);
    const created = await createPatient(
      organizationId,
      { ...body, email: body.email || null },
      repository,
    );
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { id: string } }>('/patients/:id', async (request) => {
    const { organizationId } = authOf(request);
    const body = updateBody.parse(request.body);
    return updatePatient(
      organizationId,
      request.params.id,
      { ...body, ...(body.email !== undefined ? { email: body.email || null } : {}) },
      repository,
    );
  });

  app.delete<{ Params: { id: string } }>('/patients/:id', async (request, reply) => {
    const { organizationId } = authOf(request);
    await deletePatient(organizationId, request.params.id, repository);
    return reply.status(204).send();
  });
}
