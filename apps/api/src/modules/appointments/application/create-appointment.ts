import type { AppointmentDto } from '@avisar/shared';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import type { PatientRepository } from '../../patients/domain/patient.repository.js';
import type { ProfessionalRepository } from '../../professionals/domain/professional.repository.js';
import type { NotificationRepository } from '../../notifications/domain/notification.repository.js';
import { scheduleAppointmentReminders } from '../../notifications/application/schedule-appointment-reminders.js';
import type { AppointmentRepository } from '../domain/appointment.repository.js';

export interface CreateAppointmentInput {
  professionalId: string;
  patientId: string;
  startsAt: Date;
  durationMin?: number;
  notes?: string | null;
  /** Set by the user when they knowingly want to double-book. */
  allowOverlap?: boolean;
}

export interface CreateAppointmentDeps {
  appointments: AppointmentRepository;
  patients: PatientRepository;
  professionals: ProfessionalRepository;
  notifications: NotificationRepository;
}

/**
 * Booking an appointment also queues its reminders, in the same call.
 *
 * That coupling is deliberate: a reminder the user has to remember to enable
 * is exactly the manual step this product exists to remove.
 */
export async function createAppointment(
  organizationId: string,
  input: CreateAppointmentInput,
  deps: CreateAppointmentDeps,
): Promise<{ appointment: AppointmentDto; remindersScheduled: number }> {
  const professional = await deps.professionals.findById(organizationId, input.professionalId);
  if (!professional) throw new NotFoundError('Professional');
  if (!professional.active) throw new ValidationError('That professional is archived');

  const patient = await deps.patients.findById(organizationId, input.patientId);
  if (!patient) throw new NotFoundError('Patient');

  const durationMin = input.durationMin ?? professional.defaultDurationMin;

  if (!input.allowOverlap) {
    const clash = await deps.appointments.findOverlap(organizationId, {
      professionalId: input.professionalId,
      startsAt: input.startsAt,
      durationMin,
    });

    if (clash) {
      // Reported, not blocked outright: a practice sometimes double-books on
      // purpose. The client can retry with allowOverlap.
      throw new ConflictError(
        `${professional.fullName} already has an appointment with ${clash.patient.fullName} at that time`,
        { conflictingAppointmentId: clash.id, startsAt: clash.startsAt },
      );
    }
  }

  const appointment = await deps.appointments.create(organizationId, {
    professionalId: input.professionalId,
    patientId: input.patientId,
    startsAt: input.startsAt,
    durationMin,
    notes: input.notes ?? null,
  });

  const remindersScheduled = await scheduleAppointmentReminders(
    {
      organizationId,
      appointmentId: appointment.id,
      professionalId: input.professionalId,
      startsAt: input.startsAt,
      patientPhone: patient.phoneE164,
      patientOptIn: patient.whatsappOptIn,
    },
    deps.notifications,
  );

  // Reload so the response already carries the queued reminders.
  const withReminders = await deps.appointments.findById(organizationId, appointment.id);

  return { appointment: withReminders ?? appointment, remindersScheduled };
}
