import type { BillingProfileDto, DocumentKind, InvoiceDto } from '@avisar/shared';

/**
 * The QR every electronic invoice must carry, per RG 4892.
 *
 * It is not decoration: a person scanning it lands on ARCA's own site, which
 * confirms the document exists and says what we say it says. Printing an
 * invoice without it makes the paper non-compliant, so it is built from the
 * stored row rather than from anything the provider hands back.
 */

/** ARCA's own comprobante codes. */
const COMPROBANTE_CODE: Record<InvoiceDto['type'], number> = {
  A: 1,
  B: 6,
  C: 11,
};

/** ARCA's document codes for the receiver. */
const DOCUMENT_CODE: Record<DocumentKind, number> = {
  CUIT: 80,
  CUIL: 86,
  DNI: 96,
  SIN_IDENTIFICAR: 99,
};

export function buildArcaQrUrl(invoice: InvoiceDto, profile: BillingProfileDto): string | null {
  // Without a CAE there is nothing to verify, and a QR pointing at a document
  // ARCA never authorised would be worse than no QR at all.
  if (!invoice.cae || invoice.number === null) return null;

  const payload = {
    ver: 1,
    fecha: invoice.issuedOn,
    cuit: Number(profile.taxId),
    ptoVta: invoice.salesPoint,
    tipoCmp: COMPROBANTE_CODE[invoice.type],
    nroCmp: invoice.number,
    importe: invoice.total,
    moneda: invoice.currency === 'ARS' ? 'PES' : invoice.currency,
    ctz: 1,
    tipoDocRec: DOCUMENT_CODE[invoice.receiverDocKind],
    nroDocRec: Number(invoice.receiverDocNumber || 0),
    tipoCodAut: 'E',
    codAut: Number(invoice.cae),
  };

  // btoa cannot take non-Latin1, and a razón social with an accent would break
  // it — so the payload is encoded as UTF-8 bytes first.
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(binary)}`;
}
