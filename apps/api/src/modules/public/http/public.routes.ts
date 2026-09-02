import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PublicAppointmentDto } from '@avisar/shared';
import { prisma } from '../../../shared/prisma.js';
import { NotFoundError } from '../../../shared/errors.js';

const actionBody = z.object({
  action: z.enum(['CONFIRM', 'CANCEL']),
});

/**
 * The only routes with no session behind them.
 *
 * Everything the patient can do here is bounded by one opaque, single-use,
 * expiring token that maps to exactly one appointment. There is no id to
 * guess and nothing to enumerate.
 */
export async function publicRoutes(app: FastifyInstance): Promise<void> {
  /**
   * These two routes have no session behind them, so the budget is the only
   * thing standing between a stranger and an unlimited number of guesses.
   *
   * The token is 24 random bytes, which is far too much to guess — but a
   * cheap unauthenticated endpoint is also a free way to load the database,
   * and that is worth capping on its own.
   */
  const publicLimit = {
    config: {
      rateLimit: { max: 30, timeWindow: '1 minute' },
    },
  };

  app.get<{ Params: { token: string } }>('/public/appointments/:token', publicLimit, async (request) => {
    const record = await prisma.appointmentActionToken.findUnique({
      where: { token: request.params.token },
      include: {
        appointment: {
          include: { professional: true, organization: true },
        },
      },
    });

    if (!record) throw new NotFoundError('Link');

    const response: PublicAppointmentDto = {
      action: record.action,
      alreadyUsed: record.usedAt !== null,
      expired: record.expiresAt < new Date(),
      appointment: {
        startsAt: record.appointment.startsAt.toISOString(),
        status: record.appointment.status,
        professionalName: record.appointment.professional.fullName,
        organizationName: record.appointment.organization.name,
        timezone: record.appointment.organization.timezone,
      },
    };

    return response;
  });

  app.post<{ Params: { token: string } }>('/public/appointments/:token', publicLimit, async (request) => {
    const body = actionBody.parse(request.body);

    const record = await prisma.appointmentActionToken.findUnique({
      where: { token: request.params.token },
      include: { appointment: true },
    });

    if (!record) throw new NotFoundError('Link');

    const expired = record.expiresAt < new Date();
    if (expired) {
      return { ok: false, reason: 'EXPIRED' as const };
    }

    // Confirming twice is harmless and common — people tap the link again to
    // check. Only report it, never fail on it.
    if (record.usedAt !== null && record.appointment.status !== 'PENDING') {
      return { ok: true, reason: 'ALREADY_ANSWERED' as const, status: record.appointment.status };
    }

    const status = body.action === 'CONFIRM' ? 'CONFIRMED' : 'CANCELLED';

    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: record.appointmentId },
        data: {
          status,
          ...(status === 'CONFIRMED'
            ? { confirmedAt: new Date() }
            : { cancelledAt: new Date(), cancelReason: 'Cancelado por el paciente' }),
        },
      });

      await tx.appointmentActionToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });

      if (status === 'CANCELLED') {
        // Nothing queued should still go out for an appointment the patient
        // just cancelled.
        await tx.notification.deleteMany({
          where: { appointmentId: record.appointmentId, status: 'PENDING' },
        });
      }
    });

    return { ok: true, reason: 'UPDATED' as const, status };
  });
}
