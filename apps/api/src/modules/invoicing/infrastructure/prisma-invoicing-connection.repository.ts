import type { PrismaClient } from '@prisma/client';
import type {
  InvoicingConnection,
  InvoiceEnvironment,
  InvoicingConnectionRepository,
} from '../domain/invoicing-connection.repository.js';

export class PrismaInvoicingConnectionRepository implements InvoicingConnectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(organizationId: string): Promise<InvoicingConnection | null> {
    const connection = await this.prisma.invoicingConnection.findUnique({
      where: { organizationId },
      select: { encryptedApiKey: true, environment: true },
    });

    if (!connection) return null;
    if (connection.environment !== 'homologacion' && connection.environment !== 'produccion') {
      throw new Error('Stored invoicing environment is invalid');
    }

    return {
      encryptedApiKey: connection.encryptedApiKey,
      environment: connection.environment,
    };
  }

  async save(
    organizationId: string,
    encryptedApiKey: string,
    environment: InvoiceEnvironment,
  ): Promise<void> {
    await this.prisma.invoicingConnection.upsert({
      where: { organizationId },
      create: { organizationId, encryptedApiKey, environment },
      update: { encryptedApiKey, environment },
      select: { id: true },
    });
  }

  async delete(organizationId: string): Promise<void> {
    await this.prisma.invoicingConnection.deleteMany({ where: { organizationId } });
  }
}
