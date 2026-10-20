import type {
  InvoiceProvider,
  IssueResult,
  OutboundInvoice,
} from '../../domain/invoice-provider.js';
import type { InvoiceEnvironment } from '../../domain/invoicing-connection.repository.js';
import type { DocumentKind, InvoiceType, ReceiverTaxCondition } from '@avisar/shared';

export interface ArcaApiOptions {
  apiKey: string | null;
  environment: InvoiceEnvironment;
  baseUrl?: string;
}

interface ArcaApiResponse {
  resultado?: 'A' | 'R';
  cae?: string | null;
  caeFchVto?: string | null;
  cbteNro?: number | string | null;
  pdfUrl?: string | null;
  errores?: Array<{ code?: number; msg?: string }>;
  observaciones?: Array<{ code?: number; msg?: string }>;
}

/** Customer-owned credentials for the ARCA {API} REST service. */
export class ArcaApiInvoiceProvider implements InvoiceProvider {
  readonly name = 'arca_api';
  readonly live: boolean;
  private readonly baseUrl: string;

  constructor(private readonly options: ArcaApiOptions) {
    this.live = options.environment === 'produccion';
    this.baseUrl = (options.baseUrl ?? 'https://arca.api.com.ar').replace(/\/$/, '');
  }

  async issue(invoice: OutboundInvoice): Promise<IssueResult> {
    if (!this.options.apiKey) {
      return { ok: false, error: 'Conectá la cuenta de facturación antes de emitir.', retryable: false };
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/wsfe/facturas`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': invoice.reference,
        },
        body: JSON.stringify(this.payloadFor(invoice)),
      });

      let payload: ArcaApiResponse;
      try {
        payload = (await response.json()) as ArcaApiResponse;
      } catch {
        return {
          ok: false,
          error: 'El proveedor de facturación devolvió una respuesta inválida.',
          retryable: response.status >= 500,
        };
      }

      if (!response.ok || payload.resultado !== 'A' || !payload.cae) {
        return {
          ok: false,
          error: describeFailure(response.status, payload),
          // A 502 may have happened after ARCA authorized the invoice. The
          // provider's idempotency key makes a deliberate retry safe.
          retryable: response.status === 502 || response.status === 503 || response.status === 504,
        };
      }

      const number = Number(payload.cbteNro);
      if (!Number.isSafeInteger(number) || number <= 0) {
        return {
          ok: false,
          error: 'ARCA autorizó la factura, pero la respuesta no incluyó un número válido. Revisá el comprobante antes de reintentar.',
          retryable: false,
        };
      }

      return {
        ok: true,
        invoice: {
          cae: payload.cae,
          caeExpiresOn: toIsoDate(payload.caeFchVto),
          number,
          pdfUrl: payload.pdfUrl ?? null,
          providerRef: `${invoice.issuer.salesPoint}-${invoice.type}-${number}`,
        },
      };
    } catch {
      // Fetch errors are intentionally generic. Never include request headers
      // or provider credentials in persisted invoice errors or application logs.
      return {
        ok: false,
        error: 'No pudimos comunicarnos con el proveedor de facturación. Revisá el estado antes de reintentar.',
        retryable: true,
      };
    }
  }

  private payloadFor(invoice: OutboundInvoice): Record<string, unknown> {
    const serviceDate = compactDate(invoice.issuedOn);

    return {
      environment: this.options.environment,
      representada: invoice.issuer.taxId,
      cbteTipo: invoiceType(invoice.type),
      ptoVta: invoice.issuer.salesPoint,
      docTipo: documentKind(invoice.receiver.docKind),
      docNro: invoice.receiver.docNumber || '0',
      // Avisar invoices professional services. A single appointment is a
      // same-day service period; the provider requires dates for concepto 2.
      concepto: 2,
      condicionIvaReceptorId: receiverCondition(invoice.receiver.taxCondition),
      cbteFch: serviceDate,
      fchServDesde: serviceDate,
      fchServHasta: serviceDate,
      fchVtoPago: serviceDate,
      moneda: invoice.currency === 'ARS' ? 'PES' : invoice.currency,
      cotizacion: 1,
      items: invoice.lines.map((line) => ({
        cantidad: line.quantity,
        descripcion: line.description,
        precioUnitario: line.unitPrice,
        alicuotaIva: invoice.type === 'C' ? undefined : line.vatRate,
      })),
    };
  }
}

function invoiceType(type: InvoiceType): number {
  return { A: 1, B: 6, C: 11 }[type];
}

function documentKind(kind: DocumentKind): number {
  switch (kind) {
    case 'CUIT':
      return 80;
    case 'CUIL':
      return 86;
    case 'DNI':
      return 96;
    default:
      return 99;
  }
}

function receiverCondition(condition: ReceiverTaxCondition): number {
  switch (condition) {
    case 'RESPONSABLE_INSCRIPTO':
      return 1;
    case 'EXENTO':
      return 4;
    case 'MONOTRIBUTO':
      return 6;
    default:
      return 5;
  }
}

function compactDate(iso: string): string {
  return iso.replaceAll('-', '');
}

function toIsoDate(value: string | null | undefined): string {
  if (!value || !/^\d{8}$/.test(value)) return '';
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function describeFailure(status: number, payload: ArcaApiResponse): string {
  if (status === 401) return 'La API key de facturación es inválida o fue revocada. Volvé a conectarla.';
  if (status === 402) return 'Se agotó el cupo mensual de facturas del proveedor.';
  if (status === 403) return 'La cuenta no tiene autorizado este CUIT para emitir en el entorno elegido.';
  if (status === 429) return 'El proveedor frenó temporalmente los intentos. Revisá el comprobante antes de volver a emitir.';

  const details = [...(payload.observaciones ?? []), ...(payload.errores ?? [])]
    .map((item) => item.msg?.trim())
    .filter((message): message is string => Boolean(message))
    .map((message) => message.slice(0, 300));

  return details.length > 0
    ? details.join(' · ')
    : `El proveedor rechazó la factura (HTTP ${status}).`;
}
