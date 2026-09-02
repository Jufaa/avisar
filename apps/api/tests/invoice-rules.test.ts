import { describe, expect, it } from 'vitest';
import {
  assertReceiverIsInvoiceable,
  calculateInvoice,
  formatInvoiceNumber,
  isValidCuit,
  resolveInvoiceType,
  roundMoney,
} from '../src/modules/invoicing/domain/invoice-rules.js';

describe('resolveInvoiceType', () => {
  it('gives a monotributista C, whoever the customer is', () => {
    expect(resolveInvoiceType('MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO')).toBe('C');
    expect(resolveInvoiceType('MONOTRIBUTO', 'CONSUMIDOR_FINAL')).toBe('C');
    expect(resolveInvoiceType('MONOTRIBUTO', 'EXENTO')).toBe('C');
  });

  it('gives an exempt practice C as well', () => {
    expect(resolveInvoiceType('EXENTO', 'RESPONSABLE_INSCRIPTO')).toBe('C');
  });

  it('splits A and B for a responsable inscripto by who receives', () => {
    expect(resolveInvoiceType('RESPONSABLE_INSCRIPTO', 'RESPONSABLE_INSCRIPTO')).toBe('A');
    expect(resolveInvoiceType('RESPONSABLE_INSCRIPTO', 'CONSUMIDOR_FINAL')).toBe('B');
    expect(resolveInvoiceType('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO')).toBe('B');
  });
});

describe('calculateInvoice', () => {
  const line = { description: 'Sesión de kinesiología', quantity: 2, unitPrice: 25000 };

  it('adds VAT on top of a net price', () => {
    const result = calculateInvoice('A', [{ ...line, vatRate: 21 }]);

    expect(result.subtotal).toBe(50000);
    expect(result.vatAmount).toBe(10500);
    expect(result.total).toBe(60500);
  });

  it('never discriminates VAT on a C invoice, whatever rate was asked for', () => {
    const result = calculateInvoice('C', [{ ...line, vatRate: 21 }]);

    expect(result.lines[0].vatRate).toBe(0);
    expect(result.vatAmount).toBe(0);
    expect(result.total).toBe(50000);
  });

  it('rounds each line before summing, so the printed lines add up', () => {
    // Three lines that each land on a half cent. Summing raw and rounding once
    // would drift from what the customer sees on the paper.
    const result = calculateInvoice('A', [
      { description: 'Consulta inicial', quantity: 1, unitPrice: 33.33, vatRate: 21 },
      { description: 'Consulta control', quantity: 1, unitPrice: 33.33, vatRate: 21 },
      { description: 'Consulta final', quantity: 1, unitPrice: 33.34, vatRate: 21 },
    ]);

    const linesTotal = result.lines.reduce((sum, item) => sum + item.total, 0);
    expect(roundMoney(linesTotal)).toBe(result.total);
    expect(result.subtotal).toBe(100);
  });

  it('mixes rates on one invoice', () => {
    const result = calculateInvoice('A', [
      { description: 'Servicio gravado', quantity: 1, unitPrice: 1000, vatRate: 21 },
      { description: 'Servicio reducido', quantity: 1, unitPrice: 1000, vatRate: 10.5 },
    ]);

    expect(result.vatAmount).toBe(315);
    expect(result.total).toBe(2315);
  });

  it('refuses a rate ARCA does not accept', () => {
    expect(() => calculateInvoice('A', [{ ...line, vatRate: 15 }])).toThrow(/not a VAT rate/);
  });

  it('refuses a description too short for the provider', () => {
    expect(() =>
      calculateInvoice('C', [{ description: 'Ses', quantity: 1, unitPrice: 100, vatRate: 0 }]),
    ).toThrow(/4 characters/);
  });

  it('refuses an invoice with no lines', () => {
    expect(() => calculateInvoice('C', [])).toThrow(/at least one line/);
  });

  it('refuses a quantity of zero', () => {
    expect(() => calculateInvoice('C', [{ ...line, quantity: 0, vatRate: 0 }])).toThrow(
      /greater than zero/,
    );
  });
});

describe('isValidCuit', () => {
  it('accepts a CUIT whose check digit is right', () => {
    expect(isValidCuit('20358418180')).toBe(true);
  });

  it('rejects one digit off', () => {
    expect(isValidCuit('20358418181')).toBe(false);
  });

  it('rejects the wrong length', () => {
    expect(isValidCuit('2035841818')).toBe(false);
    expect(isValidCuit('')).toBe(false);
  });

  it('ignores the dashes people type', () => {
    expect(isValidCuit('20-35841818-0')).toBe(true);
  });
});

describe('assertReceiverIsInvoiceable', () => {
  it('lets a final consumer go unidentified', () => {
    expect(() =>
      assertReceiverIsInvoiceable('SIN_IDENTIFICAR', '', 'CONSUMIDOR_FINAL'),
    ).not.toThrow();
  });

  it('refuses to leave a registered business unidentified', () => {
    expect(() =>
      assertReceiverIsInvoiceable('SIN_IDENTIFICAR', '', 'RESPONSABLE_INSCRIPTO'),
    ).toThrow(/identified by CUIT/);
  });

  it('refuses a DNI for a registered business', () => {
    expect(() =>
      assertReceiverIsInvoiceable('DNI', '35841818', 'RESPONSABLE_INSCRIPTO'),
    ).toThrow(/identified by CUIT/);
  });

  it('catches a mistyped CUIT before it travels', () => {
    expect(() => assertReceiverIsInvoiceable('CUIT', '20358418181', 'RESPONSABLE_INSCRIPTO')).toThrow(
      /not a valid CUIT/,
    );
  });

  it('accepts a plain DNI for a consumer', () => {
    expect(() => assertReceiverIsInvoiceable('DNI', '35841818', 'CONSUMIDOR_FINAL')).not.toThrow();
  });

  it('rejects a DNI of the wrong length', () => {
    expect(() => assertReceiverIsInvoiceable('DNI', '123', 'CONSUMIDOR_FINAL')).toThrow(
      /7 or 8 digits/,
    );
  });
});

describe('formatInvoiceNumber', () => {
  it('pads the way it is printed on paper', () => {
    expect(formatInvoiceNumber(3, 127)).toBe('0003-00000127');
  });

  it('has nothing to format until ARCA assigns a number', () => {
    expect(formatInvoiceNumber(3, null)).toBeNull();
  });
});
