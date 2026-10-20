import { renderTemplate, templateVariables } from '../domain/render-template.js';
import type { ConfirmationLinkFactory } from '../domain/confirmation-link.js';
import type { NotificationProvider, OrganizationNotificationProviderResolver } from '../domain/notification-provider.js';
import type { DueReminder, NotificationRepository } from '../domain/notification.repository.js';

export interface DispatchOptions {
  batchSize: number;
  maxDelayMinutes: number;
  maxAttempts: number;
}

export interface DispatchDeps {
  repository: NotificationRepository;
  provider: NotificationProvider | OrganizationNotificationProviderResolver;
  links: ConfirmationLinkFactory;
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  failed: number;
  cancelled: number;
}

/**
 * One tick of the reminder job.
 *
 * Claim → render → send → record. Every reminder is settled individually:
 * one patient's bad phone number must never stop the other forty-nine
 * messages in the batch from going out.
 */
export async function dispatchDueReminders(
  options: DispatchOptions,
  deps: DispatchDeps,
  now: Date = new Date(),
): Promise<DispatchSummary> {
  const due = await deps.repository.claimDue(now, {
    batchSize: options.batchSize,
    maxDelayMinutes: options.maxDelayMinutes,
  });

  const summary: DispatchSummary = { claimed: due.length, sent: 0, failed: 0, cancelled: 0 };

  for (const reminder of due) {
    const skipReason = reasonToSkip(reminder);
    if (skipReason) {
      await deps.repository.markCancelled(reminder.id, skipReason);
      summary.cancelled += 1;
      continue;
    }

    try {
      // The link outlives the appointment by an hour so a patient who opens
      // the message late still lands on a page that explains itself.
      const link = await deps.links.createFor(
        reminder.appointmentId,
        new Date(reminder.startsAt.getTime() + 3_600_000),
      );

      const context = {
        patientName: reminder.patientName,
        professionalName: reminder.professionalName,
        organizationName: reminder.organizationName,
        startsAt: reminder.startsAt,
        timezone: reminder.timezone,
        link: link.url,
      };

      const body = renderTemplate(reminder.templateBody, context);

      const provider = typeof deps.provider === 'function'
        ? await deps.provider(reminder.organizationId)
        : deps.provider;
      const result = await provider.send({
        to: reminder.toPhone,
        body,
        variables: templateVariables(context),
        buttonParameter: link.token,
        reference: reminder.id,
      });

      if (result.ok) {
        await deps.repository.markSent(reminder.id, result.providerMessageId, body);
        summary.sent += 1;
        continue;
      }

      const giveUp = !result.retryable || reminder.attempts >= options.maxAttempts;
      await deps.repository.markFailed(reminder.id, result.error, giveUp);
      summary.failed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const giveUp = reminder.attempts >= options.maxAttempts;
      await deps.repository.markFailed(reminder.id, message, giveUp);
      summary.failed += 1;
    }
  }

  return summary;
}

/**
 * Conditions checked at send time, not at schedule time. Between the two the
 * appointment may have been cancelled or the patient may have opted out, and
 * the outbox row would happily send anyway.
 */
function reasonToSkip(reminder: DueReminder): string | null {
  if (reminder.appointmentStatus === 'CANCELLED') return 'Appointment was cancelled';
  if (reminder.appointmentStatus === 'NO_SHOW') return 'Appointment was closed as a no-show';
  if (!reminder.patientOptIn) return 'Patient opted out of WhatsApp messages';
  return null;
}
