import { beforeEach, describe, expect, it } from 'vitest';
import { dispatchDueReminders } from '../src/modules/notifications/application/dispatch-due-reminders.js';
import { scheduleAppointmentReminders } from '../src/modules/notifications/application/schedule-appointment-reminders.js';
import { FakeNotificationProvider } from '../src/modules/notifications/infrastructure/providers/fake.provider.js';
import type {
  ActiveRule,
  DueReminder,
  NotificationRepository,
  ScheduledReminder,
} from '../src/modules/notifications/domain/notification.repository.js';
import type { ConfirmationLinkFactory } from '../src/modules/notifications/domain/confirmation-link.js';

/**
 * In-memory stand-in for the outbox.
 *
 * The use case depends on the repository interface, so the whole reminder
 * pipeline is testable without Postgres, without Twilio and without waiting
 * for a cron tick. That is the entire point of the hexagonal boundary.
 */
class InMemoryNotificationRepository implements Partial<NotificationRepository> {
  rules: ActiveRule[] = [];
  scheduled: Array<ScheduledReminder & { appointmentId: string }> = [];
  due: DueReminder[] = [];

  readonly sent: string[] = [];
  readonly failed: Array<{ id: string; error: string; giveUp: boolean }> = [];
  readonly cancelled: Array<{ id: string; reason: string }> = [];

  async activeRulesFor(): Promise<ActiveRule[]> {
    return this.rules;
  }

  async scheduleMany(
    _organizationId: string,
    appointmentId: string,
    reminders: ScheduledReminder[],
  ): Promise<number> {
    this.scheduled.push(...reminders.map((reminder) => ({ ...reminder, appointmentId })));
    return reminders.length;
  }

  async cancelPendingFor(appointmentId: string): Promise<number> {
    const before = this.scheduled.length;
    this.scheduled = this.scheduled.filter((item) => item.appointmentId !== appointmentId);
    return before - this.scheduled.length;
  }

  async claimDue(): Promise<DueReminder[]> {
    const claimed = this.due;
    this.due = [];
    return claimed;
  }

  async markSent(id: string): Promise<void> {
    this.sent.push(id);
  }

  async markFailed(id: string, error: string, giveUp: boolean): Promise<void> {
    this.failed.push({ id, error, giveUp });
  }

  async markCancelled(id: string, reason: string): Promise<void> {
    this.cancelled.push({ id, reason });
  }
}

const links: ConfirmationLinkFactory = {
  createFor: async (appointmentId) => ({
    url: `https://avisar.app/t/token-${appointmentId}`,
    token: `token-${appointmentId}`,
  }),
};

function reminder(overrides: Partial<DueReminder> = {}): DueReminder {
  return {
    id: 'notification-1',
    organizationId: 'org-1',
    appointmentId: 'appointment-1',
    attempts: 1,
    toPhone: '+5491144445555',
    templateBody: 'Hola {nombre_paciente}, te esperamos el {fecha} a las {hora}. {link}',
    patientName: 'María Suárez',
    patientOptIn: true,
    professionalName: 'Juan Pérez',
    organizationName: 'Centro Belgrano',
    timezone: 'America/Argentina/Buenos_Aires',
    startsAt: new Date('2026-09-03T17:30:00.000Z'),
    appointmentStatus: 'PENDING',
    ...overrides,
  };
}

const OPTIONS = { batchSize: 10, maxDelayMinutes: 120, maxAttempts: 3 };

describe('scheduleAppointmentReminders', () => {
  let repository: InMemoryNotificationRepository;

  beforeEach(() => {
    repository = new InMemoryNotificationRepository();
  });

  it('creates one reminder per active rule', async () => {
    repository.rules = [
      { id: 'rule-24', hoursBefore: 24, templateId: 'template-1', professionalId: null },
      { id: 'rule-2', hoursBefore: 2, templateId: 'template-1', professionalId: null },
    ];

    const startsAt = new Date('2026-09-03T17:30:00.000Z');
    const now = new Date('2026-09-01T10:00:00.000Z');

    const count = await scheduleAppointmentReminders(
      {
        organizationId: 'org-1',
        appointmentId: 'appointment-1',
        professionalId: 'professional-1',
        startsAt,
        patientPhone: '+5491144445555',
        patientOptIn: true,
      },
      repository as unknown as NotificationRepository,
      now,
    );

    expect(count).toBe(2);
    expect(repository.scheduled.map((item) => item.scheduledFor.toISOString())).toEqual([
      '2026-09-02T17:30:00.000Z',
      '2026-09-03T15:30:00.000Z',
    ]);
  });

  it('skips a reminder whose send time already passed', async () => {
    repository.rules = [
      { id: 'rule-24', hoursBefore: 24, templateId: 'template-1', professionalId: null },
      { id: 'rule-2', hoursBefore: 2, templateId: 'template-1', professionalId: null },
    ];

    // Booked for later today: the 24-hour reminder must not fire retroactively.
    const startsAt = new Date('2026-09-01T20:00:00.000Z');
    const now = new Date('2026-09-01T10:00:00.000Z');

    const count = await scheduleAppointmentReminders(
      {
        organizationId: 'org-1',
        appointmentId: 'appointment-1',
        professionalId: 'professional-1',
        startsAt,
        patientPhone: '+5491144445555',
        patientOptIn: true,
      },
      repository as unknown as NotificationRepository,
      now,
    );

    expect(count).toBe(1);
    expect(repository.scheduled[0]?.ruleId).toBe('rule-2');
  });

  it('schedules nothing for a patient who opted out', async () => {
    repository.rules = [{ id: 'rule-24', hoursBefore: 24, templateId: 'template-1', professionalId: null }];

    const count = await scheduleAppointmentReminders(
      {
        organizationId: 'org-1',
        appointmentId: 'appointment-1',
        professionalId: 'professional-1',
        startsAt: new Date('2026-09-03T17:30:00.000Z'),
        patientPhone: '+5491144445555',
        patientOptIn: false,
      },
      repository as unknown as NotificationRepository,
      new Date('2026-09-01T10:00:00.000Z'),
    );

    expect(count).toBe(0);
    expect(repository.scheduled).toHaveLength(0);
  });
});

describe('dispatchDueReminders', () => {
  let repository: InMemoryNotificationRepository;
  let provider: FakeNotificationProvider;

  beforeEach(() => {
    repository = new InMemoryNotificationRepository();
    provider = new FakeNotificationProvider();
  });

  async function run() {
    return dispatchDueReminders(
      OPTIONS,
      { repository: repository as unknown as NotificationRepository, provider, links },
    );
  }

  it('sends a due reminder with the variables already replaced', async () => {
    repository.due = [reminder()];

    const summary = await run();

    expect(summary).toMatchObject({ claimed: 1, sent: 1, failed: 0, cancelled: 0 });
    expect(provider.sent).toHaveLength(1);

    const message = provider.sent[0]!;
    expect(message.to).toBe('+5491144445555');
    expect(message.body).toContain('María Suárez');
    expect(message.body).toContain('14:30');
    expect(message.body).toContain('https://avisar.app/t/token-appointment-1');
    expect(message.body).not.toContain('{');
  });

  it('never sends for an appointment that was cancelled after scheduling', async () => {
    repository.due = [reminder({ appointmentStatus: 'CANCELLED' })];

    const summary = await run();

    expect(summary).toMatchObject({ sent: 0, cancelled: 1 });
    expect(provider.sent).toHaveLength(0);
    expect(repository.cancelled[0]?.reason).toContain('cancelled');
  });

  it('never sends to a patient who opted out after scheduling', async () => {
    repository.due = [reminder({ patientOptIn: false })];

    const summary = await run();

    expect(summary).toMatchObject({ sent: 0, cancelled: 1 });
    expect(provider.sent).toHaveLength(0);
  });

  it('keeps a retryable failure alive for the next tick', async () => {
    repository.due = [reminder({ attempts: 1 })];
    provider.failNextWith('rate limited', true);

    const summary = await run();

    expect(summary).toMatchObject({ sent: 0, failed: 1 });
    expect(repository.failed[0]).toMatchObject({ giveUp: false });
  });

  it('gives up on a permanent failure instead of burning quota', async () => {
    repository.due = [reminder({ attempts: 1 })];
    provider.failNextWith('invalid To number', false);

    await run();

    expect(repository.failed[0]).toMatchObject({ giveUp: true });
  });

  it('gives up once the attempt budget is spent', async () => {
    repository.due = [reminder({ attempts: 3 })];
    provider.failNextWith('temporary glitch', true);

    await run();

    expect(repository.failed[0]).toMatchObject({ giveUp: true });
  });

  it('settles each reminder on its own, so one bad number cannot block the batch', async () => {
    repository.due = [
      reminder({ id: 'notification-1' }),
      reminder({ id: 'notification-2', appointmentStatus: 'CANCELLED' }),
      reminder({ id: 'notification-3' }),
    ];

    const summary = await run();

    expect(summary).toMatchObject({ claimed: 3, sent: 2, cancelled: 1 });
    expect(repository.sent).toEqual(['notification-1', 'notification-3']);
  });
});
