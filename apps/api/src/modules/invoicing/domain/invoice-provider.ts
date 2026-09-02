/**
 * The contract between this application and whatever actually talks to ARCA.
 *
 * Nothing in `application/` knows there is a TusFacturas, a certificate or a
 * SOAP envelope behind this. It knows this file. That is what lets the whole
 * invoicing feature be built and tested today, against a fake, with no fiscal
 * account and no cost — and switched to the real thing by changing one
 * environment variable.
 */

import type { DocumentKind, InvoiceType, ReceiverTaxCondition } from '@avisar/shared';

/** The issuer, copied from the billing profile at issue time. */
export interface InvoiceIssuer {
  /** CUIT, digits only. */
  taxId: string;
  legalName: string;
  salesPoint: number;
}

export interface InvoiceReceiver {
  name: string;
  docKind: DocumentKind;
  /** Digits only. Empty when `docKind` is SIN_IDENTIFICAR. */
  docNumber: string;
  taxCondition: ReceiverTaxCondition;
  /**
   * Postal address. Optional for us, required by the provider, so an adapter
   * substitutes a dash rather than letting the call fail: a consultation
   * invoiced to a walk-in has no address to ask for.
   */
  address: string | null;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  /** Percentage: 21, 10.5 or 0. */
  vatRate: number;
  subtotal: number;
  vatAmount: number;
  total: number;
}

export interface OutboundInvoice {
  type: InvoiceType;
  /** Calendar date of the document, as YYYY-MM-DD. */
  issuedOn: string;
  issuer: InvoiceIssuer;
  receiver: InvoiceReceiver;
  lines: InvoiceLine[];
  subtotal: number;
  vatAmount: number;
  total: number;
  currency: string;
  /**
   * Our own invoice id. Sent as the provider's idempotency key so a retry
   * after a timeout cannot produce a second fiscal document for the same
   * draft — the single most expensive mistake this module can make.
   */
  reference: string;
}

/**
 * What comes back when ARCA authorises the document.
 *
 * The CAE is the whole point: without it there is no invoice, only a row in
 * our database. `number` is assigned by ARCA, never chosen here.
 */
export interface IssuedInvoice {
  cae: string;
  /** YYYY-MM-DD. The CAE stops being valid after this date. */
  caeExpiresOn: string;
  number: number;
  /** Where the rendered PDF lives, when the provider hosts it. */
  pdfUrl: string | null;
  /** The provider's own id for the document, kept for reconciliation. */
  providerRef: string | null;
}

export type IssueResult =
  | { ok: true; invoice: IssuedInvoice }
  | {
      ok: false;
      error: string;
      /**
       * Whether trying again could plausibly work.
       *
       * A rejected CUIT is not retryable; ARCA being down is. Getting this
       * wrong in the optimistic direction is how you end up with duplicate
       * fiscal documents, so adapters default to `false` when unsure.
       */
      retryable: boolean;
    };

export interface InvoiceProvider {
  /** Human-readable name, surfaced in logs and in the settings screen. */
  readonly name: string;
  /**
   * Whether documents actually reach ARCA.
   *
   * The interface shows this, loudly. Someone must never believe they issued
   * a real invoice when they issued a simulation.
   */
  readonly live: boolean;
  issue(invoice: OutboundInvoice): Promise<IssueResult>;
}
