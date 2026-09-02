import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ACCOUNT_MODE } from '@avisar/shared';
import { prisma } from '../../../shared/prisma.js';
import { authOf, requireAuth } from '../../../shared/http/auth.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { isValidTimeZone } from '../../../shared/datetime.js';
import { PrismaOrganizationRepository } from '../infrastructure/prisma-organization.repository.js';

const updateBody = z.object({
  name: z.string().trim().min(2).optional(),
  timezone: z.string().trim().min(1).optional(),
  mode: z.enum(ACCOUNT_MODE).optional(),
});

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  const repository = new PrismaOrganizationRepository(prisma);

  app.addHook('preHandler', requireAuth);

  app.get('/me', async (request) => {
    const { sub } = authOf(request);
    const account = await repository.findAccount(sub);
    if (!account) throw new NotFoundError('Account');
    return account;
  });

  app.patch('/organization', async (request) => {
    const { organizationId } = authOf(request);
    const body = updateBody.parse(request.body);

    if (body.timezone && !isValidTimeZone(body.timezone)) {
      throw new ValidationError('That timezone is not recognized');
    }

    // Going back to solo would hide agendas that still hold appointments,
    // and the owner would have no screen left to reach them from.
    if (body.mode === 'SOLO') {
      const active = await prisma.professional.count({
        where: { organizationId, active: true },
      });

      if (active > 1) {
        throw new ConflictError(
          `Tenés ${active} profesionales activos. Archivá los que no uses antes de volver al modo individual.`,
          { active },
        );
      }
    }

    return repository.update(organizationId, body);
  });

  app.post('/organization/onboarding/complete', async (request) => {
    const { organizationId } = authOf(request);
    return repository.completeOnboarding(organizationId);
  });
}
