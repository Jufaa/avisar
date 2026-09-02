import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { ConfirmationLink, ConfirmationLinkFactory } from '../domain/confirmation-link.js';

/**
 * One opaque token per appointment, reused while it is still valid.
 *
 * The appointment id never appears in the URL. If it did, anyone could
 * increment ids and cancel other people's appointments — the patient-facing
 * link has no session behind it, so the token *is* the authorization.
 */
export class TokenConfirmationLinkFactory implements ConfirmationLinkFactory {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly webAppUrl: string,
  ) {}

  async createFor(appointmentId: string, expiresAt: Date): Promise<ConfirmationLink> {
    const existing = await this.prisma.appointmentActionToken.findFirst({
      where: {
        appointmentId,
        action: 'CONFIRM',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) return { url: this.buildUrl(existing.token), token: existing.token };

    const token = randomBytes(24).toString('base64url');

    await this.prisma.appointmentActionToken.create({
      data: { appointmentId, token, action: 'CONFIRM', expiresAt },
    });

    return { url: this.buildUrl(token), token };
  }

  private buildUrl(token: string): string {
    return `${this.webAppUrl.replace(/\/$/, '')}/t/${token}`;
  }
}
