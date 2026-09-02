import { subtractHours } from '../../../shared/datetime.js';
import type { NotificationRepository, ScheduledReminder } from '../domain/notification.repository.js';

export interface ScheduleRemindersInput {
  organizationId: string;
  appointmentId: string;
  professionalId: string;
  startsAt: Date;
  patientPhone: string;
  patientOptIn: boolean;
}

/**
 * Turns an appointment into rows in the outbox.
 *
 * Called every time an appointment is created or moved. Reminders whose send
 * time already passed are skipped: booking a patient for two hours from now
 * must not fire the 24-hour reminder retroactively.
 */
export async function scheduleAppointmentReminders(
  input: ScheduleRemindersInput,
  repository: NotificationRepository,
  now: Date = new Date(),
): Promise<number> {
  if (!input.patientOptIn) return 0;

  const rules = await repository.activeRulesFor(input.organizationId, input.professionalId);

  const reminders: ScheduledReminder[] = rules
    .map((rule) => ({
      ruleId: rule.id,
      scheduledFor: subtractHours(input.startsAt, rule.hoursBefore),
      toPhone: input.patientPhone,
    }))
    .filter((reminder) => reminder.scheduledFor > now);

  return repository.scheduleMany(input.organizationId, input.appointmentId, reminders);
}
