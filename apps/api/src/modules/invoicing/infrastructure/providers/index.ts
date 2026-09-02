import { env } from '../../../../config/env.js';
import { prisma } from '../../../../shared/prisma.js';
import type { InvoiceProvider } from '../../domain/invoice-provider.js';
import { FakeInvoiceProvider } from './fake.provider.js';
import { TusFacturasInvoiceProvider } from './tusfacturas.provider.js';

let instance: InvoiceProvider | null = null;

/**
 * The single place the concrete invoicing provider is chosen.
 *
 * Switching the product from a simulated CAE to a real one issued through
 * ARCA is one environment variable, and nothing above this file changes. It
 * is the same trade the notification providers make, for the same reason.
 */
export function invoiceProvider(): InvoiceProvider {
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
