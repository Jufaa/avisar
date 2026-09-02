import type { AppointmentDto } from '@avisar/shared';
import { NotFoundError } from '../../../shared/errors.js';
import { dropAppointmentReminders } from '../../notifications/application/reschedule-appointment-reminders.js';
import type { AppointmentRepository } from '../domain/appointment.repository.js';
import type { NotificationRepository } from '../../notifications/domain/notification.repository.js';

/**
 * Cancelling clears the queued reminders in the same operation.
 *
 * The dispatcher also re-checks the appointment status before sending, so a
 * cancellation that lands mid-flight is still caught. Two guards, because
 * this is the failure the patient actually notices.
 */
export async function cancelAppointment(
  organizationId: string,
  appointmentId: string,
  reason: string | null,
  deps: { appointments: AppointmentRepository; notifications: NotificationRepository },
): Promise<AppointmentDto> {
  const current = await deps.appointments.findById(organizationId, appointmentId);
  if (!current) throw new NotFoundError('Appointment');

  const cancelled = await deps.appointments.cancel(organizationId, appointmentId, reason);
  await dropAppointmentReminders(appointmentId, deps.notifications);

  // Reload after dropping: the row read above still carried the queued
  // reminders, and returning it would show the agenda a pending reminder on
  // an appointment that no longer has one.
  return (await deps.appointments.findById(organizationId, appointmentId)) ?? cancelled;
}
