import type {
  InvoiceProvider,
  IssueResult,
  OutboundInvoice,
} from '../../domain/invoice-provider.js';

/**
 * Simulates ARCA without an account, a certificate or a peso of cost.
 *
 * This is not a stub for tests: it is how the whole invoicing feature gets
 * built, reviewed and demonstrated before anybody pays for a provider. Every
 * layer above it — the domain rules, the draft/confirm split, the screens, the
 * PDF, the error states — is exercised for real against this.
 *
 * The one thing it cannot rehearse is the real API's own quirks, and that is
 * deliberately the only thing left behind the interface.
 */
export class FakeInvoiceProvider implements InvoiceProvider {
  readonly name = 'fake';
  /**
   * False, loudly and on purpose.
   *
   * The interface reads this to warn on every screen. Someone believing they
   * issued a real invoice when they issued a simulation is the worst outcome
   * this module can produce, so it is never a detail buried in a log line.
   */
  readonly live = false;

  constructor(
    /**
     * What ARCA would have assigned. Asked of our own database because the
     * simulation still has to respect the one rule that is not negotiable:
     * numbering is sequential per point of sale and per type.
     */
    private readonly nextNumber: (salesPoint: number, type: string) => Promise<number>,
  ) {}

  async issue(invoice: OutboundInvoice): Promise<IssueResult> {
    const number = await this.nextNumber(invoice.issuer.salesPoint, invoice.type);

    // ARCA's CAE is 14 digits. Shaped the same way so nothing downstream
    // learns to expect a format the real provider will not produce.
    const cae = String(Date.now()).padStart(13, '0').slice(-13) + String(number % 10);

    const issuedOn = new Date(`${invoice.issuedOn}T00:00:00Z`);
    const expires = new Date(issuedOn);
    expires.setUTCDate(expires.getUTCDate() + 10);

    return {
      ok: true,
      invoice: {
        cae,
        caeExpiresOn: expires.toISOString().slice(0, 10),
        number,
        // It hosts nothing, so it claims nothing. The app renders its own
        // preview from the stored row.
        pdfUrl: null,
        providerRef: `fake-${invoice.reference}`,
      },
    };
  }
}
