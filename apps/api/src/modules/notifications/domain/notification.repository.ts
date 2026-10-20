import type { MessageTemplateDto, NotificationLogDto, ReminderRuleDto } from '@avisar/shared';
import type { DeliveryEvent } from './delivery-status.js';

export interface ActiveRule {
  id: string;
  hoursBefore: number;
  templateId: string;
  professionalId: string | null;
}

export interface DueReminder {
  id: string;
  organizationId: string;
  appointmentId: string;
  attempts: number;
  toPhone: string;
  templateBody: string;
  patientName: string;
  patientOptIn: boolean;
  professionalName: string;
  organizationName: string;
  timezone: string;
  startsAt: Date;
  appointmentStatus: string;
}

export interface ScheduledReminder {
  ruleId: string;
  scheduledFor: Date;
  toPhone: string;
}

export interface NotificationRepository {
  /** Rules that apply to one professional: their own override, or the org default. */
  activeRulesFor(organizationId: string, professionalId: string): Promise<ActiveRule[]>;

  /**
   * Inserts pending rows, ignoring any that already exist.
   * Idempotency is enforced by the unique (appointment_id, rule_id) index,
   * not by checking first — a check would still race.
   */
  scheduleMany(
    organizationId: string,
    appointmentId: string,
    reminders: ScheduledReminder[],
  ): Promise<number>;

  /** Cancels the pending reminders of an appointment that moved or was cancelled. */
  cancelPendingFor(appointmentId: string): Promise<number>;

  /**
   * Claims a batch of due reminders. The implementation must make it safe for
   * two processes to poll at the same time.
   */
  claimDue(now: Date, options: { batchSize: number; maxDelayMinutes: number }): Promise<DueReminder[]>;

  markSent(id: string, providerMessageId: string, renderedBody: string): Promise<void>;
  markFailed(id: string, error: string, giveUp: boolean): Promise<void>;
  markCancelled(id: string, reason: string): Promise<void>;

  /**
   * Records what the provider reported about a message we already sent.
   *
   * Resolved by provider message id, not by our own id, because the webhook
   * only knows theirs. Returns whether a row actually changed: Meta retries
   * deliveries we already processed, and an unmatched id is normal the first
   * time we deploy this against an account with history.
   */
  applyDeliveryEvent(event: DeliveryEvent): Promise<boolean>;

  listLog(
    organizationId: string,
    options: { limit: number; offset: number },
  ): Promise<{ items: NotificationLogDto[]; total: number }>;

  listRules(organizationId: string): Promise<ReminderRuleDto[]>;
  createRule(
    organizationId: string,
    input: { hoursBefore: number; templateId: string; professionalId: string | null },
  ): Promise<ReminderRuleDto>;
  updateRule(
    organizationId: string,
    id: string,
    input: { hoursBefore?: number; enabled?: boolean; templateId?: string },
  ): Promise<ReminderRuleDto>;
  deleteRule(organizationId: string, id: string): Promise<void>;

  listTemplates(organizationId: string): Promise<MessageTemplateDto[]>;
  updateTemplate(
    organizationId: string,
    id: string,
    input: { name?: string; body?: string },
  ): Promise<MessageTemplateDto>;
}
