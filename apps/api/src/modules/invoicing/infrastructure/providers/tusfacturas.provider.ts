import type {
  InvoiceProvider,
  IssueResult,
  OutboundInvoice,
} from '../../domain/invoice-provider.js';
import type { DocumentKind, InvoiceType, ReceiverTaxCondition } from '@avisar/shared';

export interface TusFacturasOptions {
  apiKey: string;
  apiToken: string;
  userToken: string;
  /** Overridable so a sandbox base can be pointed at without a code change. */
  baseUrl: string;
}

/**
 * Electronic invoicing through TusFacturas, which fronts ARCA for us.
 *
 * They hold the certificate, run the WSAA handshake and follow ARCA's changes;
 * we send JSON and get a CAE. That trade is the whole reason this adapter is
 * two hundred lines instead of a month of SOAP.
 *
 * The dependency is real and deliberate: if the cost per document ever stops
 * being worth it, a second adapter implementing the same port talks to ARCA
 * directly and nothing above this file changes.
 */
export class TusFacturasInvoiceProvider implements InvoiceProvider {
  readonly name = 'tusfacturas';
  readonly live = true;

  constructor(private readonly options: TusFacturasOptions) {}

  async issue(invoice: OutboundInvoice): Promise<IssueResult> {
    const url = `${this.options.baseUrl.replace(/\/$/, '')}/facturacion/nuevo`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(this.payloadFor(invoice)),
      });

      // Rate limiting is the one case they signal by status rather than in
      // the body, and it is worth another attempt later.
      if (response.status === 429) {
        return { ok: false, error: 'TusFacturas rate limit reached', retryable: true };
      }

      const payload = (await response.json()) as TusFacturasResponse;

      // The trap in this API: a rejected invoice still comes back as HTTP 200.
      // Trusting the status code here would mark a document ISSUED that ARCA
      // never authorised, and the practice would find out at year end.
      if (!response.ok || payload.error === 'S') {
        return {
          ok: false,
          error: describe(payload, response.status),
          // A rejection is a rejection: their errors are validation errors,
          // and retrying an invalid CUIT forever helps nobody. Only transport
          // and rate limits are worth repeating.
          retryable: false,
        };
      }

      if (!payload.cae) {
        // No CAE means nothing was authorised, whatever else the body says.
        return {
          ok: false,
          error: 'TusFacturas accepted the request but returned no CAE',
          retryable: true,
        };
      }

      return {
        ok: true,
        invoice: {
          cae: payload.cae,
          caeExpiresOn: toIsoDate(payload.vencimiento),
          number: Number(payload.comprobante_nro ?? payload.numero ?? 0),
          // Their link is only good for the day it was issued, so it is stored
          // as a convenience and never as the canonical copy of the document.
          pdfUrl: payload.comprobante_pdf_url ?? payload.pdf_url ?? null,
          providerRef: payload.external_reference ?? invoice.reference,
        },
      };
    } catch (error) {
      // Transport-level failure. The document may or may not exist on their
      // side, which is exactly why `reference` travels as external_reference:
      // a human can reconcile it without guessing.
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Network error reaching TusFacturas: ${detail}`, retryable: true };
    }
  }

  private payloadFor(invoice: OutboundInvoice): Record<string, unknown> {
    return {
      usertoken: this.options.userToken,
      apikey: this.options.apiKey,
      apitoken: this.options.apiToken,
      cliente: {
        documento_tipo: documentKind(invoice.receiver.docKind),
        documento_nro: invoice.receiver.docNumber || '0',
        razon_social: invoice.receiver.name,
        // Required by them, frequently unknown to us.
        domicilio: invoice.receiver.address || '-',
        condicion_iva: receiverCondition(invoice.receiver.taxCondition),
        envia_por_mail: 'N',
        condicion_pago: '0',
      },
      comprobante: {
        fecha: toArgentineDate(invoice.issuedOn),
        vencimiento: toArgentineDate(invoice.issuedOn),
        tipo: `FACTURA ${invoice.type}`,
        operacion: 'V',
        punto_venta: invoice.issuer.salesPoint,
        moneda: invoice.currency === 'ARS' ? 'PES' : invoice.currency,
        cotizacion: 1,
        idioma: 1,
        // Our own invoice id. Their idempotency handle and, when a call times
        // out, the only way to find out whether the document exists.
        external_reference: invoice.reference,
        rubro: 'Servicios profesionales',
        rubro_grupo_contable: 'Servicios',
        detalle: invoice.lines.map((line) => ({
          cantidad: line.quantity,
          afecta_stock: 'N',
          producto: {
            descripcion: line.description,
            unidad_bulto: 1,
            precio_unitario_sin_iva: line.unitPrice,
            alicuota: vatRate(invoice.type, line.vatRate),
            actualiza_precio: 'N',
          },
        })),
        total: invoice.total,
      },
    };
  }
}

interface TusFacturasResponse {
  error?: string;
  errores?: string[];
  cae?: string;
  vencimiento?: string;
  numero?: string | number;
  comprobante_nro?: string | number;
  pdf_url?: string;
  comprobante_pdf_url?: string;
  external_reference?: string;
  observaciones?: string;
}

/** DNI | CUIT | PASAPORTE | OTRO, per their table. */
function documentKind(kind: DocumentKind): string {
  switch (kind) {
    case 'CUIT':
    case 'CUIL':
      return 'CUIT';
    case 'DNI':
      return 'DNI';
    default:
      return 'OTRO';
  }
}

/**
 * Their VAT condition codes.
 *
 * Verify these against their current table on the first live call: a wrong
 * code here is rejected by them rather than silently mis-issued, which is the
 * failure mode we want, but it still costs a round trip to discover.
 */
function receiverCondition(condition: ReceiverTaxCondition): string {
  switch (condition) {
    case 'RESPONSABLE_INSCRIPTO':
      return 'RI';
    case 'MONOTRIBUTO':
      return 'M';
    case 'EXENTO':
      return 'EX';
    default:
      return 'CF';
  }
}

/** A C invoice carries no VAT, so its lines always travel at zero. */
function vatRate(type: InvoiceType, rate: number): number {
  return type === 'C' ? 0 : rate;
}

/** They speak dd/mm/yyyy; we store and reason in ISO. */
function toArgentineDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function toIsoDate(argentine: string | undefined): string {
  if (!argentine) return '';
  const [day, month, year] = argentine.split('/');
  if (!day || !month || !year) return '';
  return `${year}-${month}-${day}`;
}

function describe(payload: TusFacturasResponse, status: number): string {
  const errors = payload.errores?.filter(Boolean) ?? [];
  if (errors.length > 0) return errors.join(' | ');
  if (payload.observaciones) return payload.observaciones;
  return `TusFacturas rejected the invoice (HTTP ${status})`;
}
