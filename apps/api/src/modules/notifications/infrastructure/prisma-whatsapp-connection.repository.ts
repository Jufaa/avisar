import type { PrismaClient } from '@prisma/client';
import type { WhatsAppConnection, WhatsAppConnectionRepository } from '../domain/whatsapp-connection.repository.js';

export class PrismaWhatsAppConnectionRepository implements WhatsAppConnectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(organizationId: string): Promise<WhatsAppConnection | null> {
    const rows = await this.prisma.$queryRaw<WhatsAppConnection[]>`
      SELECT status, encrypted_access_token AS "encryptedAccessToken", waba_id AS "wabaId",
             phone_number_id AS "phoneNumberId", display_phone_number AS "displayPhoneNumber"
      FROM whatsapp_connection WHERE organization_id = ${organizationId}`;
    return rows[0] ?? null;
  }

  async beginSignup(organizationId: string, stateHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO whatsapp_connection (organization_id, signup_state_hash, signup_expires_at, updated_at)
      VALUES (${organizationId}, ${stateHash}, ${expiresAt}, CURRENT_TIMESTAMP)
      ON CONFLICT (organization_id) DO UPDATE SET signup_state_hash = ${stateHash},
        signup_expires_at = ${expiresAt}, signup_consumed = false, updated_at = CURRENT_TIMESTAMP`;
  }

  async consumeSignup(organizationId: string, stateHash: string, now: Date): Promise<boolean> {
    const updated = await this.prisma.$executeRaw`
      UPDATE whatsapp_connection SET signup_consumed = true, updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = ${organizationId} AND signup_state_hash = ${stateHash}
        AND signup_expires_at > ${now} AND signup_consumed = false`;
    return updated === 1;
  }

  async completeSignup(
    organizationId: string,
    stateHash: string,
    connection: Pick<WhatsAppConnection, 'encryptedAccessToken' | 'wabaId' | 'phoneNumberId' | 'displayPhoneNumber'>,
  ): Promise<boolean> {
    // A disconnect or a newer signup replaces the hash, preventing a late
    // Meta response from silently reconnecting a tenant against its wishes.
    const updated = await this.prisma.$executeRaw`
      UPDATE whatsapp_connection SET status = 'CONNECTED',
        encrypted_access_token = ${connection.encryptedAccessToken}, waba_id = ${connection.wabaId},
        phone_number_id = ${connection.phoneNumberId}, display_phone_number = ${connection.displayPhoneNumber},
        signup_state_hash = NULL, signup_expires_at = NULL, signup_consumed = false,
        updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = ${organizationId} AND signup_state_hash = ${stateHash}
        AND signup_consumed = true AND signup_expires_at > CURRENT_TIMESTAMP`;
    return updated === 1;
  }

  async disconnect(organizationId: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO whatsapp_connection (organization_id, updated_at)
      VALUES (${organizationId}, CURRENT_TIMESTAMP)
      ON CONFLICT (organization_id) DO UPDATE SET status = 'DISCONNECTED',
        encrypted_access_token = NULL, waba_id = NULL, phone_number_id = NULL,
        display_phone_number = NULL, signup_state_hash = NULL, signup_expires_at = NULL,
        signup_consumed = false, updated_at = CURRENT_TIMESTAMP`;
  }
}
