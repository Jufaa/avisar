import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { APPOINTMENT_STATUS } from '@avisar/shared';
import { prisma } from '../../../shared/prisma.js';
import { authOf, requireAuth } from '../../../shared/http/auth.js';
import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { PrismaAppointmentRepository } from '../infrastructure/prisma-appointment.repository.js';
import { PrismaPatientRepository } from '../../patients/infrastructure/prisma-patient.repository.js';
import { PrismaProfessionalRepository } from '../../professionals/infrastructure/prisma-professional.repository.js';
import { PrismaNotificationRepository } from '../../notifications/infrastructure/prisma-notification.repository.js';
import { createAppointment } from '../application/create-appointment.js';
import { updateAppointment } from '../application/update-appointment.js';
import { cancelAppointment } from '../application/cancel-appointment.js';
import { createPatient } from '../../patients/application/create-patient.js';

const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const rangeQuery = z.object({
  from: isoDate,
  to: isoDate,
  professionalId: z.string().uuid().optional(),
});

/** A brand-new patient can be created inline, so booking never leaves the screen. */
const inlinePatient = z.object({
  fullName: z.string().trim().min(2, 'Enter the patient name'),
  phone: z.string().trim().min(6, 'Enter the WhatsApp number'),
});

const createBody = z
  .object({
    professionalId: z.string().uuid('Choose a professional'),
    patientId: z.string().uuid().optional(),
    newPatient: inlinePatient.optional(),
    startsAt: isoDate,
    durationMin: z.coerce.number().int().min(5).max(480).optional(),
    notes: z.string().trim().max(1000).nullish(),
    allowOverlap: z.boolean().optional(),
  })
  .refine((value) => value.patientId !== undefined || value.newPatient !== undefined, {
    message: 'Choose an existing patient or enter a new one',
    path: ['patientId'],
  });

const updateBody = z.object({
  professionalId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  startsAt: isoDate.optional(),
  durationMin: z.coerce.number().int().min(5).max(480).optional(),
  notes: z.string().trim().max(1000).nullish(),
  status: z.enum(APPOINTMENT_STATUS).optional(),
  allowOverlap: z.boolean().optional(),
});

const cancelBody = z.object({
  reason: z.string().trim().max(300).nullish(),
});

export async function appointmentRoutes(app: FastifyInstance): Promise<void> {
  const appointments = new PrismaAppointmentRepository(prisma);
  const patients = new PrismaPatientRepository(prisma);
  const professionals = new PrismaProfessionalRepository(prisma);
  const notifications = new PrismaNotificationRepository(prisma);
  const deps = { appointments, patients, professionals, notifications };

  app.addHook('preHandler', requireAuth);

  app.get('/appointments', async (request) => {
    const { organizationId } = authOf(request);
    const query = rangeQuery.parse(request.query);

    if (query.to <= query.from) throw new ValidationError('The end of the range must be after the start');

    const spanDays = (query.to.getTime() - query.from.getTime()) / 86_400_000;
    if (spanDays > 62) throw new ValidationError('Ask for at most two months at a time');

    return appointments.listRange(organizationId, query);
  });

  app.get<{ Params: { id: string } }>('/appointments/:id', async (request) => {
    const { organizationId } = authOf(request);
    const found = await appointments.findById(organizationId, request.params.id);
    if (!found) throw new NotFoundError('Appointment');
    return found;
  });

  app.post('/appointments', async (request, reply) => {
    const { organizationId } = authOf(request);
    const body = createBody.parse(request.body);

    let patientId = body.patientId;
    if (!patientId && body.newPatient) {
      const created = await createPatient(organizationId, body.newPatient, patients);
      patientId = created.id;
    }

    const result = await createAppointment(
      organizationId,
      {
        professionalId: body.professionalId,
        patientId: patientId!,
        startsAt: body.startsAt,
        durationMin: body.durationMin,
        notes: body.notes ?? null,
        allowOverlap: body.allowOverlap,
      },
      deps,
    );

    return reply.status(201).send(result);
  });

  app.patch<{ Params: { id: string } }>('/appointments/:id', async (request) => {
    const { organizationId } = authOf(request);
    const body = updateBody.parse(request.body);
    return updateAppointment(organizationId, request.params.id, body, deps);
  });

  app.post<{ Params: { id: string } }>('/appointments/:id/cancel', async (request) => {
    const { organizationId } = authOf(request);
    const body = cancelBody.parse(request.body ?? {});
    return cancelAppointment(organizationId, request.params.id, body.reason ?? null, {
      appointments,
      notifications,
    });
  });

  app.post<{ Params: { id: string } }>('/appointments/:id/confirm', async (request) => {
    const { organizationId } = authOf(request);
    return updateAppointment(organizationId, request.params.id, { status: 'CONFIRMED' }, deps);
  });
}
