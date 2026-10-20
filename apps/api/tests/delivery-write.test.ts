import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/shared/prisma.js';
import { PrismaNotificationRepository } from '../src/modules/notifications/infrastructure/prisma-notification.repository.js';

/**
 * The delivery write, against a real database.
 *
 * Every other delivery test stops at the edge of persistence: parse the body,
 * check the signature, decide whether to apply. This one proves the row
 * actually changes, which is the only claim that matters to a clinic asking
 * "did the patient get it?".
 */

const repository = new PrismaNotificationRepository(prisma);

let notificationId: string;
let sentProviderId: string;
let organizationId: string;
let ruleId: string;
let otherAppointmentId: string;

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { name: `Webhook fixture ${randomUUID().slice(0, 8)}`, timezone: 'America/Argentina/Buenos_Aires' },
  });
  organizationId = organization.id;

  const professional = await prisma.professional.create({
    data: {
      organizationId: organization.id,
      fullName: 'Fixture Professional',
      specialty: 'Kinesiología',
      color: '#1F6E4E',
      defaultDurationMin: 45,
    },
  });

  const patient = await prisma.patient.create({
    data: {
      organizationId: organization.id,
      fullName: 'Fixture Patient',
      phoneE164: "+15551234567",
      whatsappOptIn: true,
    },
  });

  const template = await prisma.messageTemplate.create({
    data: {
      organizationId: organization.id,
      name: 'Fixture reminder',
      kind: 'REMINDER',
      body: 'Hola {{patient}}, tu turno es {{date}} a las {{time}}. Confirmá: {{link}}',
    },
  });

  const rule = await prisma.reminderRule.create({
    data: { organizationId: organization.id, templateId: template.id, hoursBefore: 24 },
  });
  ruleId = rule.id;

  const professionals = await Promise.all([
    professional,
    await prisma.professional.create({
      data: {
        organizationId: organization.id,
        fullName: 'Second Fixture Professional',
        specialty: 'Kinesiología',
        color: '#2C5F8A',
        defaultDurationMin: 45,
      },
    }),
  ]);

  const appointment = await prisma.appointment.create({
    data: {
      organizationId: organization.id,
      professionalId: professional.id,
      patientId: patient.id,
      startsAt: new Date(Date.now() + 86_400_000),
    },
  });

  // A reminder pair is unique per appointment and rule, so a second row needs
  // its own appointment. This one exists only to give the truncation test
  // somewhere to write.
  otherAppointmentId = (
    await prisma.appointment.create({
      data: {
        organizationId: organization.id,
        professionalId: professionals[1].id,
        patientId: patient.id,
        startsAt: new Date(Date.now() + 172_800_000),
      },
    })
  ).id;

  sentProviderId = `wamid.FIXTURE-${randomUUID()}`;
  const notification = await prisma.notification.create({
    data: {
      organizationId: organization.id,
      appointmentId: appointment.id,
      ruleId: rule.id,
      scheduledFor: new Date(),
      toPhone: '+15551234567',
      status: 'SENT',
      providerMessageId: sentProviderId,
      sentAt: new Date(),
    },
  });

  notificationId = notification.id;
});

afterAll(async () => {
  // Cascades clear the fixture, so this is only the organization.
  await prisma.organization.deleteMany({ where: { name: { startsWith: 'Webhook fixture' } } });
  await prisma.$disconnect();
});

const delivery = (status: 'DELIVERED' | 'READ' | 'UNDELIVERED', error?: string) => ({
  providerMessageId: sentProviderId,
  status,
  at: new Date('2026-10-03T12:00:00.000Z'),
  ...(error ? { error } : {}),
});

const readRow = () =>
  prisma.notification.findUniqueOrThrow({
    where: { id: notificationId },
    select: { deliveryStatus: true, deliveredAt: true, deliveryError: true },
  });

describe('applyDeliveryEvent', () => {
  it('records a delivery and when it happened', async () => {
    expect(await repository.applyDeliveryEvent(delivery('DELIVERED'))).toBe(true);

    expect(await readRow()).toEqual({
      deliveryStatus: 'DELIVERED',
      deliveredAt: new Date('2026-10-03T12:00:00.000Z'),
      deliveryError: null,
    });
  });

  it('promotes a delivery to a read', async () => {
    expect(await repository.applyDeliveryEvent(delivery('READ'))).toBe(true);
    expect((await readRow()).deliveryStatus).toBe('READ');
  });

  /**
   * Meta retries deliveries we already processed, so this has to be a no-op
   * rather than an error — and it has to leave the row alone.
   */
  it('ignores a replay of a report it already recorded', async () => {
    expect(await repository.applyDeliveryEvent(delivery('READ'))).toBe(false);
    expect((await readRow()).deliveryStatus).toBe('READ');
  });

  /**
   * The contradiction that actually occurs in production: Meta delivers, then
   * retries and reports failure. The delivery already happened, so the late
   * failure must not overwrite it.
   */
  it('does not let a late failure undo a read', async () => {
    expect(await repository.applyDeliveryEvent(delivery('UNDELIVERED', '131047: Re-engagement'))).toBe(false);

    const row = await readRow();
    expect(row.deliveryStatus).toBe('READ');
    expect(row.deliveryError).toBeNull();
  });

  it('reports false for a message this app never sent', async () => {
    expect(
      await repository.applyDeliveryEvent({
        providerMessageId: `wamid.UNKNOWN-${randomUUID()}`,
        status: 'DELIVERED',
        at: new Date(),
      }),
    ).toBe(false);
  });

  it('records why a message never arrived, truncated to a storable length', async () => {
    const created = await prisma.notification.create({
      data: {
        organizationId: organizationId,
        appointmentId: otherAppointmentId,
        ruleId: ruleId,
        scheduledFor: new Date(),
        toPhone: '+15551234567',
        status: 'SENT',
        providerMessageId: `wamid.LONG-${randomUUID()}`,
      },
    });

    try {
      const applied = await repository.applyDeliveryEvent({
        providerMessageId: created.providerMessageId as string,
        status: 'UNDELIVERED',
        at: new Date(),
        error: 'x'.repeat(5000),
      });

      expect(applied).toBe(true);

      const row = await prisma.notification.findUniqueOrThrow({
        where: { id: created.id },
        select: { deliveryStatus: true, deliveredAt: true, deliveryError: true },
      });

      expect(row.deliveryStatus).toBe('UNDELIVERED');
      expect(row.deliveryError).toHaveLength(500);
      // Never delivered, so there is no delivery instant to record.
      expect(row.deliveredAt).toBeNull();
    } finally {
      await prisma.notification.delete({ where: { id: created.id } });
    }
  });
});
