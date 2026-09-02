import { Prisma, type PrismaClient } from '@prisma/client';
import type { MessageTemplateDto, NotificationLogDto, ReminderRuleDto } from '@avisar/shared';
import { formatPhoneForDisplay } from '../../../shared/phone.js';
import { NotFoundError } from '../../../shared/errors.js';
import type {
  ActiveRule,
  DueReminder,
  NotificationRepository,
  ScheduledReminder,
} from '../domain/notification.repository.js';

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * A professional-specific rule overrides the organization default for the
   * same `hoursBefore`. Without that collapse, a practice that customized one
   * agenda would send that patient two identical messages.
   */
  async activeRulesFor(organizationId: string, professionalId: string): Promise<ActiveRule[]> {
    const rules = await this.prisma.reminderRule.findMany({
      where: {
        organizationId,
        enabled: true,
        OR: [{ professionalId }, { professionalId: null }],
      },
      orderBy: [{ hoursBefore: 'asc' }],
    });

    const byHours = new Map<number, ActiveRule>();
    for (const rule of rules) {
      const existing = byHours.get(rule.hoursBefore);
      // A specific rule wins over the organization-wide one.
      if (!existing || rule.professionalId !== null) {
        byHours.set(rule.hoursBefore, {
          id: rule.id,
          hoursBefore: rule.hoursBefore,
          templateId: rule.templateId,
          professionalId: rule.professionalId,
        });
      }
    }

    return [...byHours.values()];
  }

  async scheduleMany(
    organizationId: string,
    appointmentId: string,
    reminders: ScheduledReminder[],
  ): Promise<number> {
    if (reminders.length === 0) return 0;

    const result = await this.prisma.notification.createMany({
      data: reminders.map((reminder) => ({
        organizationId,
        appointmentId,
        ruleId: reminder.ruleId,
        scheduledFor: reminder.scheduledFor,
        toPhone: reminder.toPhone,
      })),
      // The unique (appointment_id, rule_id) index does the deduplication.
      // Checking first would still race with a concurrent request.
      skipDuplicates: true,
    });

    return result.count;
  }

  async cancelPendingFor(appointmentId: string): Promise<number> {
    const result = await this.prisma.notification.deleteMany({
      where: { appointmentId, status: 'PENDING' },
    });
    return result.count;
  }

  /**
   * Claims a batch atomically.
   *
   * `FOR UPDATE SKIP LOCKED` is what makes it safe to run more than one API
   * process: each poller takes a disjoint set of rows instead of two of them
   * sending the same reminder.
   *
   * The lower bound on `scheduled_for` is the safety net: after a long
   * outage, a reminder for an appointment that already happened must not go
   * out. Late is worse than never for this message.
   */
  async claimDue(
    now: Date,
    options: { batchSize: number; maxDelayMinutes: number },
  ): Promise<DueReminder[]> {
    const floor = new Date(now.getTime() - options.maxDelayMinutes * 60_000);

    const claimedIds = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM notification
        WHERE status = 'PENDING'::"NotificationStatus"
          AND scheduled_for <= ${now}
          AND scheduled_for >= ${floor}
        ORDER BY scheduled_for ASC
        LIMIT ${options.batchSize}
        FOR UPDATE SKIP LOCKED
      `);

      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return ids;

      await tx.notification.updateMany({
        where: { id: { in: ids } },
        data: { status: 'SENDING', attempts: { increment: 1 } },
      });

      return ids;
    });

    if (claimedIds.length === 0) return [];

    const rows = await this.prisma.notification.findMany({
      where: { id: { in: claimedIds } },
      include: {
        organization: true,
        rule: { include: { template: true } },
        appointment: { include: { patient: true, professional: true } },
      },
      orderBy: { scheduledFor: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      appointmentId: row.appointmentId,
      attempts: row.attempts,
      toPhone: row.toPhone,
      templateBody: row.rule.template.body,
      patientName: row.appointment.patient.fullName,
      patientOptIn: row.appointment.patient.whatsappOptIn,
      professionalName: row.appointment.professional.fullName,
      organizationName: row.organization.name,
      timezone: row.organization.timezone,
      startsAt: row.appointment.startsAt,
      appointmentStatus: row.appointment.status,
    }));
  }

  /** Returns rows abandoned in SENDING by a crashed process back to PENDING. */
  async recoverStalled(olderThanMinutes: number): Promise<number> {
    const threshold = new Date(Date.now() - olderThanMinutes * 60_000);
    const result = await this.prisma.notification.updateMany({
      where: { status: 'SENDING', updatedAt: { lt: threshold } },
      data: { status: 'PENDING' },
    });
    return result.count;
  }

  async markSent(id: string, providerMessageId: string, renderedBody: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status: 'SENT', providerMessageId, renderedBody, sentAt: new Date(), error: null },
    });
  }

  async markFailed(id: string, error: string, giveUp: boolean): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      // Not giving up puts the row back in PENDING so the next tick retries it.
      data: { status: giveUp ? 'FAILED' : 'PENDING', error: error.slice(0, 500) },
    });
  }

  async markCancelled(id: string, reason: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status: 'CANCELLED', error: reason.slice(0, 500) },
    });
  }

  async listLog(
    organizationId: string,
    options: { limit: number; offset: number },
  ): Promise<{ items: NotificationLogDto[]; total: number }> {
    const where = { organizationId, status: { not: 'PENDING' as const } };

    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: { appointment: { include: { patient: true, professional: true } } },
        orderBy: { createdAt: 'desc' },
        take: options.limit,
        skip: options.offset,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        scheduledFor: row.scheduledFor.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
        status: row.status,
        attempts: row.attempts,
        error: row.error,
        renderedBody: row.renderedBody,
        toPhone: formatPhoneForDisplay(row.toPhone),
        patientName: row.appointment.patient.fullName,
        professionalName: row.appointment.professional.fullName,
        appointmentStartsAt: row.appointment.startsAt.toISOString(),
      })),
      total,
    };
  }

  async listRules(organizationId: string): Promise<ReminderRuleDto[]> {
    const rows = await this.prisma.reminderRule.findMany({
      where: { organizationId },
      orderBy: { hoursBefore: 'asc' },
    });
    return rows.map(toRuleDto);
  }

  async createRule(
    organizationId: string,
    input: { hoursBefore: number; templateId: string; professionalId: string | null },
  ): Promise<ReminderRuleDto> {
    const created = await this.prisma.reminderRule.create({
      data: {
        organizationId,
        hoursBefore: input.hoursBefore,
        templateId: input.templateId,
        professionalId: input.professionalId,
      },
    });
    return toRuleDto(created);
  }

  async updateRule(
    organizationId: string,
    id: string,
    input: { hoursBefore?: number; enabled?: boolean; templateId?: string },
  ): Promise<ReminderRuleDto> {
    const updated = await this.prisma.reminderRule.update({
      where: { id, organizationId },
      data: input,
    });
    return toRuleDto(updated);
  }

  async deleteRule(organizationId: string, id: string): Promise<void> {
    await this.prisma.reminderRule.delete({ where: { id, organizationId } });
  }

  async listTemplates(organizationId: string): Promise<MessageTemplateDto[]> {
    const rows = await this.prisma.messageTemplate.findMany({
      where: { organizationId },
      orderBy: { kind: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, body: row.body }));
  }

  async updateTemplate(
    organizationId: string,
    id: string,
    input: { name?: string; body?: string },
  ): Promise<MessageTemplateDto> {
    const existing = await this.prisma.messageTemplate.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundError('Template');

    const updated = await this.prisma.messageTemplate.update({ where: { id }, data: input });
    return { id: updated.id, name: updated.name, kind: updated.kind, body: updated.body };
  }
}

function toRuleDto(rule: {
  id: string;
  hoursBefore: number;
  enabled: boolean;
  professionalId: string | null;
  templateId: string;
}): ReminderRuleDto {
  return {
    id: rule.id,
    hoursBefore: rule.hoursBefore,
    enabled: rule.enabled,
    professionalId: rule.professionalId,
    templateId: rule.templateId,
  };
}
