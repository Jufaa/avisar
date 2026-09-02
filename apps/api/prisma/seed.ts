import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_TEMPLATES, DEFAULT_REMINDER_HOURS } from '../src/modules/notifications/domain/defaults.js';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@avisar.app';
const DEMO_PASSWORD = 'demo1234';

/**
 * A demo practice with appointments in the next few days, so the agenda and
 * the reminder job have something real to work with on first run.
 */
async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log(`Demo account already exists (${DEMO_EMAIL}). Nothing to do.`);
    return;
  }

  const organization = await prisma.organization.create({
    data: {
      name: 'Centro de Kinesiología Belgrano',
      timezone: 'America/Argentina/Buenos_Aires',
      plan: 'FREE',
      // The demo is a practice with several professionals, so it shows the
      // clinic interface. A fresh sign-up defaults to SOLO.
      mode: 'CLINIC',
    },
  });

  await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      fullName: 'Laura Fernández',
    },
  });

  const reminderTemplate = await prisma.messageTemplate.create({
    data: {
      organizationId: organization.id,
      name: DEFAULT_TEMPLATES.reminder.name,
      kind: 'REMINDER',
      body: DEFAULT_TEMPLATES.reminder.body,
    },
  });

  await prisma.messageTemplate.create({
    data: {
      organizationId: organization.id,
      name: DEFAULT_TEMPLATES.confirmation.name,
      kind: 'CONFIRMATION',
      body: DEFAULT_TEMPLATES.confirmation.body,
    },
  });

  const rule = await prisma.reminderRule.create({
    data: {
      organizationId: organization.id,
      professionalId: null,
      templateId: reminderTemplate.id,
      hoursBefore: DEFAULT_REMINDER_HOURS,
    },
  });

  const professionals = await Promise.all(
    [
      { fullName: 'Juan Pérez', specialty: 'Kinesiología deportiva', color: '#1F6E4E' },
      { fullName: 'Ana Gómez', specialty: 'Kinesiología respiratoria', color: '#2C5F8A' },
      { fullName: 'Pablo Ruiz', specialty: 'Rehabilitación', color: '#8A5A2C' },
    ].map((professional) =>
      prisma.professional.create({
        data: { organizationId: organization.id, ...professional, defaultDurationMin: 45 },
      }),
    ),
  );

  const patients = await Promise.all(
    [
      { fullName: 'María Suárez', phoneE164: '+5491144445555' },
      { fullName: 'Carlos Benítez', phoneE164: '+5491144445556' },
      { fullName: 'Lucía Ramos', phoneE164: '+5491144445557' },
      { fullName: 'Diego Molina', phoneE164: '+5491144445558' },
      { fullName: 'Sofía Herrera', phoneE164: '+5491144445559' },
    ].map((patient) =>
      prisma.patient.create({ data: { organizationId: organization.id, ...patient } }),
    ),
  );

  // Spread appointments over the next four days, starting at 09:00 local.
  const base = new Date();
  base.setHours(9, 0, 0, 0);

  let created = 0;
  for (let day = 1; day <= 4; day += 1) {
    for (let slot = 0; slot < 3; slot += 1) {
      const professional = professionals[(day + slot) % professionals.length]!;
      const patient = patients[(day * 3 + slot) % patients.length]!;

      const startsAt = new Date(base);
      startsAt.setDate(startsAt.getDate() + day);
      startsAt.setHours(9 + slot * 2, 0, 0, 0);

      const appointment = await prisma.appointment.create({
        data: {
          organizationId: organization.id,
          professionalId: professional.id,
          patientId: patient.id,
          startsAt,
          durationMin: 45,
          status: slot === 0 ? 'CONFIRMED' : 'PENDING',
        },
      });

      const scheduledFor = new Date(startsAt.getTime() - DEFAULT_REMINDER_HOURS * 3_600_000);
      if (scheduledFor > new Date()) {
        await prisma.notification.create({
          data: {
            organizationId: organization.id,
            appointmentId: appointment.id,
            ruleId: rule.id,
            scheduledFor,
            toPhone: patient.phoneE164,
          },
        });
      }

      created += 1;
    }
  }

  console.log('');
  console.log('  Demo data ready');
  console.log('  ───────────────────────────────────');
  console.log(`  Practice:      ${organization.name}`);
  console.log(`  Professionals: ${professionals.length}`);
  console.log(`  Patients:      ${patients.length}`);
  console.log(`  Appointments:  ${created}`);
  console.log('');
  console.log(`  Sign in with   ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log('');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
