import type { AppointmentDto, AppointmentStatus } from '@avisar/shared';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { rescheduleAppointmentReminders } from '../../notifications/application/reschedule-appointment-reminders.js';
import type { CreateAppointmentDeps } from './create-appointment.js';

export interface UpdateAppointmentInput {
  professionalId?: string;
  patientId?: string;
  startsAt?: Date;
  durationMin?: number;
  notes?: string | null;
  status?: AppointmentStatus;
  allowOverlap?: boolean;
}

/**
 * Any change to who, when or with whom rebuilds the reminder queue from
 * scratch. Patching the existing rows in place is how a stale reminder for
 * the old time survives a reschedule.
 */
export async function updateAppointment(
  organizationId: string,
  appointmentId: string,
  input: UpdateAppointmentInput,
  deps: CreateAppointmentDeps,
): Promise<AppointmentDto> {
  const current = await deps.appointments.findById(organizationId, appointmentId);
  if (!current) throw new NotFoundError('Appointment');

  const professionalId = input.professionalId ?? current.professional.id;
  const patientId = input.patientId ?? current.patient.id;
  const startsAt = input.startsAt ?? new Date(current.startsAt);
  const durationMin = input.durationMin ?? current.durationMin;

  const scheduleChanged =
    input.startsAt !== undefined ||
    input.durationMin !== undefined ||
    input.professionalId !== undefined ||
    input.patientId !== undefined;

  if (scheduleChanged && !input.allowOverlap) {
    const clash = await deps.appointments.findOverlap(organizationId, {
      professionalId,
      startsAt,
      durationMin,
      excludeAppointmentId: appointmentId,
    });

    if (clash) {
      throw new ConflictError(
        `That slot overlaps with the appointment of ${clash.patient.fullName}`,
        { conflictingAppointmentId: clash.id, startsAt: clash.startsAt },
      );
    }
  }

  const updated = await deps.appointments.update(organizationId, appointmentId, {
    ...(input.professionalId !== undefined ? { professionalId: input.professionalId } : {}),
    ...(input.patientId !== undefined ? { patientId: input.patientId } : {}),
    ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
    ...(input.durationMin !== undefined ? { durationMin: input.durationMin } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });

  if (scheduleChanged) {
    const patient = await deps.patients.findById(organizationId, patientId);

    await rescheduleAppointmentReminders(
      {
        organizationId,
        appointmentId,
        professionalId,
        startsAt,
        patientPhone: patient?.phoneE164 ?? updated.patient.phoneE164,
        patientOptIn: patient?.whatsappOptIn ?? true,
      },
      deps.notifications,
    );
  }

  return (await deps.appointments.findById(organizationId, appointmentId)) ?? updated;
}
