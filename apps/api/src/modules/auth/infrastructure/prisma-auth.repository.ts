import type { PrismaClient } from '@prisma/client';
import type { AccountUser, AuthRepository, CreatedAccount, NewAccount } from '../domain/auth.repository.js';
import { DEFAULT_TEMPLATES, DEFAULT_REMINDER_HOURS } from '../../notifications/domain/defaults.js';

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<AccountUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      passwordHash: user.passwordHash,
      fullName: user.fullName,
    };
  }

  async emailExists(email: string): Promise<boolean> {
    const found = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    return found !== null;
  }

  /**
   * Creating an account is one transaction: organization, user, default
   * message template and default reminder rule. A practice that signs up
   * has working reminders before it books its first appointment — the
   * feature is the product, it cannot be something you configure later.
   */
  async createAccount(input: NewAccount): Promise<CreatedAccount> {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: input.organizationName,
          timezone: input.timezone,
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: input.email,
          passwordHash: input.passwordHash,
          fullName: input.fullName,
        },
      });

      // A solo account never sees the word "professional", but the agenda
      // still belongs to one. Creating it here — named after the owner and
      // linked to their login — is what lets the interface hide the concept
      // without the data model losing it.
      await tx.professional.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          fullName: input.fullName,
        },
      });

      const reminderTemplate = await tx.messageTemplate.create({
        data: {
          organizationId: organization.id,
          name: DEFAULT_TEMPLATES.reminder.name,
          kind: 'REMINDER',
          body: DEFAULT_TEMPLATES.reminder.body,
        },
      });

      await tx.messageTemplate.create({
        data: {
          organizationId: organization.id,
          name: DEFAULT_TEMPLATES.confirmation.name,
          kind: 'CONFIRMATION',
          body: DEFAULT_TEMPLATES.confirmation.body,
        },
      });

      await tx.reminderRule.create({
        data: {
          organizationId: organization.id,
          professionalId: null,
          templateId: reminderTemplate.id,
          hoursBefore: DEFAULT_REMINDER_HOURS,
          enabled: true,
        },
      });

      return { userId: user.id, organizationId: organization.id };
    });
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }
}
