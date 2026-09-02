import type { NotificationRepository } from '../domain/notification.repository.js';
import {
  scheduleAppointmentReminders,
  type ScheduleRemindersInput,
} from './schedule-appointment-reminders.js';

/**
 * An appointment that moved keeps no trace of its old reminders.
 *
 * A reminder for a time that no longer exists is worse than sending nothing:
 * the patient shows up at the wrong hour and stops trusting the message.
 */
export async function rescheduleAppointmentReminders(
  input: ScheduleRemindersInput,
  repository: NotificationRepository,
  now: Date = new Date(),
): Promise<number> {
  await repository.cancelPendingFor(input.appointmentId);
  return scheduleAppointmentReminders(input, repository, now);
}

/** Used when an appointment is cancelled outright. */
export async function dropAppointmentReminders(
  appointmentId: string,
  repository: NotificationRepository,
): Promise<number> {
  return repository.cancelPendingFor(appointmentId);
}
