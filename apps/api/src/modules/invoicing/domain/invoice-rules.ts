/**
 * The fiscal rules, as pure functions.
 *
 * No database, no HTTP, no provider. Everything here can be reasoned about
 * and tested on its own, which matters more in this module than anywhere else
 * in the product: a bug here is not a bug, it is somebody's tax problem.
 */

import type {
  DocumentKind,
  InvoiceType,
  ReceiverTaxCondition,
  TaxCondition,
} from '@avisar/shared';
import { ValidationError } from '../../../shared/errors.js';

export interface DraftLineInput {
  description: string;
  quantity: number;
  /**
   * Price WITHOUT VAT, always.
   *
   * Deciding this once, here, is what keeps the rest of the module honest: a
   * B invoice shows the consumer a final price, an A invoice shows the net
   * and the VAT apart, and both are the same numbers rendered differently.
   * Storing "sometimes net, sometimes gross" is how totals stop reconciling.
   */
  unitPrice: number;
  /** Percentage: 0, 10.5, 21 or 27. Forced to 0 on a C invoice. */
  vatRate: number;
}

export interface CalculatedLine extends DraftLineInput {
  subtotal: number;
  vatAmount: number;
  total: number;
}

export interface CalculatedInvoice {
  lines: CalculatedLine[];
  subtotal: number;
  vatAmount: number;
  total: number;
}

/** VAT rates ARCA accepts. Anything else is rejected before it travels. */
const ALLOWED_VAT_RATES = [0, 10.5, 21, 27];

/**
 * Rounds to cents.
 *
 * Binary floats cannot hold 0.10 exactly, so the epsilon nudge keeps values
 * that are a hair below the midpoint from rounding down. Amounts in this
 * product are pesos on a consultation, far from the range where this stops
 * being enough — a product invoicing millions per line would hold integer
 * cents end to end instead.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Which invoice class this pairing produces.
 *
 * Not a preference and not a setting: it follows from who issues and who
 * receives, so it is derived rather than asked. A monotributista who could
 * pick "A" from a dropdown would be issuing an invalid document.
 */
export function resolveInvoiceType(
  issuer: TaxCondition,
  receiver: ReceiverTaxCondition,
): InvoiceType {
  // A monotributista or an exempt practice has one option and only one.
  if (issuer !== 'RESPONSABLE_INSCRIPTO') return 'C';

  // Registered to registered discriminates VAT; everything else does not.
  return receiver === 'RESPONSABLE_INSCRIPTO' ? 'A' : 'B';
}

/**
 * A C invoice never discriminates VAT, so carrying a rate on its lines would
 * be a lie that eventually gets printed. Normalised here rather than trusted
 * from the caller.
 */
export function normalizeVatRate(type: InvoiceType, vatRate: number): number {
  if (type === 'C') return 0;
  return vatRate;
}

export function calculateInvoice(type: InvoiceType, lines: DraftLineInput[]): CalculatedInvoice {
  if (lines.length === 0) {
    throw new ValidationError('An invoice needs at least one line');
  }

  const calculated = lines.map((line) => {
    // Four characters is the provider's floor. Enforced here so "Ses" is
    // refused by our own form, where it can be fixed, instead of coming back
    // as somebody else's error code after the user pressed the button.
    if (line.description.trim().length < 4) {
      throw new ValidationError('Each line needs a description of at least 4 characters');
    }
    if (line.quantity <= 0) {
      throw new ValidationError(`Quantity must be greater than zero: "${line.description}"`);
    }
    if (line.unitPrice < 0) {
      throw new ValidationError(`Price cannot be negative: "${line.description}"`);
    }

    const vatRate = normalizeVatRate(type, line.vatRate);
    if (!ALLOWED_VAT_RATES.includes(vatRate)) {
      throw new ValidationError(
        `${vatRate}% is not a VAT rate ARCA accepts (0, 10.5, 21, 27)`,
      );
    }

    // Each line is rounded before it is summed, never after. Summing raw
    // products and rounding once makes the printed lines fail to add up to
    // the printed total, and the customer is the one who notices.
    const subtotal = roundMoney(line.quantity * line.unitPrice);
    const vatAmount = roundMoney(subtotal * (vatRate / 100));

    return {
      ...line,
      vatRate,
      subtotal,
      vatAmount,
      total: roundMoney(subtotal + vatAmount),
    };
  });

  const subtotal = roundMoney(calculated.reduce((sum, line) => sum + line.subtotal, 0));
  const vatAmount = roundMoney(calculated.reduce((sum, line) => sum + line.vatAmount, 0));

  return {
    lines: calculated,
    subtotal,
    vatAmount,
    total: roundMoney(subtotal + vatAmount),
  };
}

/**
 * A CUIT's own check digit, verified before anything travels to ARCA.
 *
 * Catching a typo here costs nothing. Catching it after the document is
 * authorised costs a credit note and a phone call.
 */
export function isValidCuit(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return false;

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, weight, index) => acc + weight * Number(digits[index]), 0);

  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 11 ? 0 : remainder === 10 ? 9 : remainder;

  return checkDigit === Number(digits[10]);
}

/**
 * The receiver's identification has to match what they are.
 *
 * ARCA rejects a registered business without a CUIT, and it is a far better
 * experience to say so in the form than to relay their error code back.
 */
export function assertReceiverIsInvoiceable(
  docKind: DocumentKind,
  docNumber: string,
  taxCondition: ReceiverTaxCondition,
): void {
  const digits = docNumber.replace(/\D/g, '');

  if (taxCondition !== 'CONSUMIDOR_FINAL' && docKind !== 'CUIT') {
    throw new ValidationError('A registered receiver must be identified by CUIT');
  }

  if (docKind === 'SIN_IDENTIFICAR') {
    if (taxCondition !== 'CONSUMIDOR_FINAL') {
      throw new ValidationError('Only a final consumer may be left unidentified');
    }
    return;
  }

  if (docKind === 'CUIT' || docKind === 'CUIL') {
    if (!isValidCuit(digits)) {
      throw new ValidationError(`${digits || 'The number'} is not a valid CUIT/CUIL`);
    }
    return;
  }

  if (digits.length < 7 || digits.length > 8) {
    throw new ValidationError('A DNI has 7 or 8 digits');
  }
}

/**
 * The number as it is printed on paper and as people quote it on the phone:
 * four digits of point of sale, eight of sequence.
 */
export function formatInvoiceNumber(salesPoint: number, number: number | null): string | null {
  if (number === null) return null;
  return `${String(salesPoint).padStart(4, '0')}-${String(number).padStart(8, '0')}`;
}
