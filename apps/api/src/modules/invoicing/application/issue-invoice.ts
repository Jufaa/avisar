import type { InvoiceDto } from '@avisar/shared';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import type { InvoiceProvider, OutboundInvoice } from '../domain/invoice-provider.js';
import type { InvoiceRepository } from '../domain/invoice.repository.js';

export interface IssueDeps {
  repository: InvoiceRepository;
  provider: InvoiceProvider;
}

/**
 * Turns a reviewed draft into a real fiscal document.
 *
 * The only place in the product that can create one. It is deliberately
 * separate from drafting, deliberately explicit, and deliberately impossible
 * to reach without an id that somebody looked at first.
 */
export async function issueInvoice(
  organizationId: string,
  invoiceId: string,
  deps: IssueDeps,
): Promise<InvoiceDto> {
  const invoice = await deps.repository.findById(organizationId, invoiceId);
  if (!invoice) throw new NotFoundError('Invoice');

  if (invoice.status === 'ISSUED') {
    // Not an error worth failing on: someone pressed the button twice, or two
    // tabs are open. The document exists and this is what it looks like.
    return invoice;
  }

  if (invoice.status === 'ISSUING') {
    throw new ConflictError(
      'This invoice is already being issued. Wait a moment before trying again.',
    );
  }

  if (invoice.status === 'VOID') {
    throw new ValidationError('A voided invoice cannot be issued again');
  }

  const profile = await deps.repository.findProfile(organizationId);
  if (!profile) throw new ValidationError('The practice tax details are missing');

  // Whoever loses this race stops here. Without it, two tabs produce two
  // fiscal documents for one consultation, and only one of them can be undone
  // — with a credit note, by a human, on the phone.
  const claimed = await deps.repository.claimForIssue(organizationId, invoiceId);
  if (!claimed) {
    throw new ConflictError('This invoice was already taken by another request');
  }

  const outbound: OutboundInvoice = {
    type: invoice.type,
    issuedOn: invoice.issuedOn,
    issuer: {
      taxId: profile.taxId,
      legalName: profile.legalName,
      salesPoint: invoice.salesPoint,
    },
    receiver: {
      name: invoice.receiverName,
      docKind: invoice.receiverDocKind,
      docNumber: invoice.receiverDocNumber,
      taxCondition: invoice.receiverTaxCondition,
      address: invoice.receiverAddress,
    },
    lines: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      vatRate: item.vatRate,
      subtotal: item.subtotal,
      vatAmount: item.vatAmount,
      total: item.total,
    })),
    subtotal: invoice.subtotal,
    vatAmount: invoice.vatAmount,
    total: invoice.total,
    currency: invoice.currency,
    // Our id, travelling as the provider's idempotency key. When a call times
    // out this is the only handle a human has to find out whether the document
    // exists on their side before anyone retries.
    reference: invoice.id,
  };

  try {
    const result = await deps.provider.issue(outbound);

    if (!result.ok) {
      return deps.repository.markFailed(invoiceId, result.error);
    }

    return deps.repository.markIssued(invoiceId, result.invoice);
  } catch (error) {
    // An adapter that throws instead of returning a result still must not
    // leave the row locked in ISSUING forever.
    const message = error instanceof Error ? error.message : String(error);
    return deps.repository.markFailed(invoiceId, message);
  }
}
