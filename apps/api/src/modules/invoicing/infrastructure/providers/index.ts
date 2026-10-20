import { env } from '../../../../config/env.js';
import { prisma } from '../../../../shared/prisma.js';
import type { InvoiceProvider } from '../../domain/invoice-provider.js';
import type {
  InvoiceEnvironment,
  InvoicingConnection,
} from '../../domain/invoicing-connection.repository.js';
import { decryptProviderCredential } from '../credential-encryption.js';
import { ArcaApiInvoiceProvider } from './arca-api.provider.js';
import { FakeInvoiceProvider } from './fake.provider.js';
import { TusFacturasInvoiceProvider } from './tusfacturas.provider.js';

let instance: InvoiceProvider | null = null;

const unavailableProvider: InvoiceProvider = {
  name: 'unavailable',
  live: false,
  async issue() {
    return {
      ok: false,
      error: 'Configura un proveedor de facturación real antes de emitir comprobantes.',
      retryable: false,
    };
  },
};

/**
 * The single place the concrete invoicing provider is chosen.
 *
 * Switching the product from a simulated CAE to a real one issued through
 * ARCA is one environment variable, and nothing above this file changes. It
 * is the same trade the notification providers make, for the same reason.
 */
export function invoiceProvider(
  apiKey: string | null = null,
  environment: InvoiceEnvironment = 'homologacion',
): InvoiceProvider {
  if (env.NODE_ENV === 'production' && env.INVOICING_PROVIDER === 'fake') {
    return unavailableProvider;
  }

  if (env.INVOICING_PROVIDER === 'arca_api') {
    return new ArcaApiInvoiceProvider({ apiKey, environment });
  }

  if (instance) return instance;

  switch (env.INVOICING_PROVIDER) {
    case 'tusfacturas':
      // env validation already guaranteed these three are present.
      instance = new TusFacturasInvoiceProvider({
        apiKey: env.TUSFACTURAS_API_KEY!,
        apiToken: env.TUSFACTURAS_API_TOKEN!,
        userToken: env.TUSFACTURAS_USER_TOKEN!,
        baseUrl: env.TUSFACTURAS_BASE_URL,
      });
      break;
    default:
      instance = new FakeInvoiceProvider(nextInvoiceNumber);
  }

  return instance;
}

/** Resolve the provider using only the authenticated organization's credential. */
export function invoiceProviderForOrganization(
  organizationId: string,
  connection: InvoicingConnection | null,
): InvoiceProvider {
  if (env.INVOICING_PROVIDER !== 'arca_api') return invoiceProvider();
  if (!connection) return invoiceProvider(null);

  const apiKey = decryptProviderCredential(
    connection.encryptedApiKey,
    organizationId,
    env.INVOICING_CREDENTIAL_ENCRYPTION_KEY!,
  );

  return invoiceProvider(apiKey, connection.environment);
}

/**
 * What ARCA would have assigned next for this point of sale and type.
 *
 * Only the fake needs this — the real provider is told the number by ARCA —
 * but the simulation still has to keep numbering sequential, or the unique
 * constraint that protects real invoices would fire during development and
 * look like a bug in the feature rather than in the fake.
 */
async function nextInvoiceNumber(salesPoint: number, type: string): Promise<number> {
  const last = await prisma.invoice.findFirst({
    where: {
      salesPoint,
      type: type as 'A' | 'B' | 'C',
      number: { not: null },
    },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  return (last?.number ?? 0) + 1;
}

export { FakeInvoiceProvider, TusFacturasInvoiceProvider };
