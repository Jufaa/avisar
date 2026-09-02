import { describe, expect, it } from 'vitest';
import { parseInvoiceRequest } from '../src/modules/invoicing/domain/parse-invoice-request.js';

describe('parseInvoiceRequest', () => {
  it('reads the shape people actually type', () => {
    const result = parseInvoiceRequest('facturale a Juan Pérez por sesión de kinesiología 25 mil');

    expect(result.receiverName).toBe('Juan Pérez');
    expect(result.unitPrice).toBe(25000);
    expect(result.description).toMatch(/kinesiolog/i);
  });

  it('reads a name that runs straight into a number', () => {
    // The name is not followed by a preposition here, it is followed by "3".
    // This exact sentence is the placeholder shown in the form, and it did not
    // parse until the receiver was allowed to end against a digit.
    const result = parseInvoiceRequest('Facturale a Juan Pérez 3 sesiones de kinesiología a 25 mil');

    expect(result.receiverName).toBe('Juan Pérez');
    expect(result.quantity).toBe(3);
    expect(result.unitPrice).toBe(25000);
    expect(result.description).toMatch(/kinesiolog/i);
  });

  it('separates a quantity from a price', () => {
    const result = parseInvoiceRequest('3 sesiones de kinesiología a María Suárez por 25 mil');

    expect(result.quantity).toBe(3);
    expect(result.unitPrice).toBe(25000);
    expect(result.receiverName).toBe('María Suárez');
  });

  it('understands Argentine number formatting', () => {
    expect(parseInvoiceRequest('consulta a Pedro por $25.000').unitPrice).toBe(25000);
    expect(parseInvoiceRequest('consulta a Pedro por $1.500,50').unitPrice).toBe(1500.5);
  });

  it('understands "millones" and the slang for it', () => {
    expect(parseInvoiceRequest('tratamiento a Ana por 1,5 millones').unitPrice).toBe(1_500_000);
    expect(parseInvoiceRequest('tratamiento a Ana por 2 palos').unitPrice).toBe(2_000_000);
  });

  it('does not mistake the unit count for the money', () => {
    const result = parseInvoiceRequest('2 consultas a Lucía por 30 mil');

    expect(result.quantity).toBe(2);
    expect(result.unitPrice).toBe(30000);
  });

  it('works in lowercase, because nobody capitalises while dictating', () => {
    const result = parseInvoiceRequest('factura a juan perez por corte de pelo 15 mil');

    expect(result.receiverName).toBe('juan perez');
    expect(result.unitPrice).toBe(15000);
  });

  it('sees through "al paciente"', () => {
    const result = parseInvoiceRequest('facturar al paciente Diego Molina por consulta 40 mil');

    expect(result.receiverName).toBe('Diego Molina');
  });

  it('reports what it could not find instead of inventing it', () => {
    const result = parseInvoiceRequest('algo suelto sin datos');

    expect(result.missing).toContain('receiverName');
    expect(result.missing).toContain('unitPrice');
    expect(result.unitPrice).toBeNull();
  });

  it('never returns a preposition as a name', () => {
    const result = parseInvoiceRequest('por 25 mil');

    expect(result.receiverName).toBeNull();
  });

  it('leaves an empty sentence entirely empty', () => {
    const result = parseInvoiceRequest('   ');

    expect(result.receiverName).toBeNull();
    expect(result.description).toBeNull();
    expect(result.unitPrice).toBeNull();
    expect(result.quantity).toBeNull();
  });
});
