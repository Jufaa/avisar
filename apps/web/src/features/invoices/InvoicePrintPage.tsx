import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useBillingProfile, useInvoice } from '../../lib/queries';
import { Button } from '../../components/ui/Button';
import { EmptyState, Loading } from '../../components/ui/Feedback';
import { formatMoney } from '../../lib/format';
import { buildArcaQrUrl } from './arca-qr';

const TYPE_NAMES: Record<'A' | 'B' | 'C', string> = {
  A: 'FACTURA A',
  B: 'FACTURA B',
  C: 'FACTURA C',
};

const RECEIVER_CONDITIONS: Record<string, string> = {
  RESPONSABLE_INSCRIPTO: 'IVA Responsable Inscripto',
  MONOTRIBUTO: 'Responsable Monotributo',
  CONSUMIDOR_FINAL: 'Consumidor Final',
  EXENTO: 'IVA Exento',
};

const ISSUER_CONDITIONS: Record<string, string> = {
  MONOTRIBUTO: 'Responsable Monotributo',
  RESPONSABLE_INSCRIPTO: 'IVA Responsable Inscripto',
  EXENTO: 'IVA Exento',
};

/**
 * The invoice as paper.
 *
 * There is no PDF endpoint on purpose: the browser already knows how to turn
 * a page into one, and the provider's own link expires the same day it is
 * issued. Rendering from our stored row means the document can be reprinted
 * years later, which is exactly how long it has to survive.
 */
export function InvoicePrintPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const invoice = useInvoice(id);
  const profile = useBillingProfile();
  const [qr, setQr] = useState<string | null>(null);

  const data = invoice.data;
  const issuer = profile.data;

  useEffect(() => {
    if (!data || !issuer) return;

    const url = buildArcaQrUrl(data, issuer);
    if (!url) {
      setQr(null);
      return;
    }

    // Rendered to a data URI so printing never waits on a network request.
    QRCode.toDataURL(url, { margin: 0, width: 240 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [data, issuer]);

  if (invoice.isLoading || profile.isLoading) return <Loading />;

  if (!data || !issuer) {
    return (
      <EmptyState
        title="No encontramos esta factura"
        description="Puede haber sido descartada."
        action={<Button onClick={() => navigate('/facturas')}>Volver a facturas</Button>}
      />
    );
  }

  const discriminatesVat = data.type === 'A';

  return (
    <div className="mx-auto w-full max-w-3xl p-4 print:max-w-none print:p-0">
      {/* Everything the paper does not need. */}
      <div className="mb-4 flex gap-2 print:hidden">
        <Button variant="secondary" onClick={() => navigate('/facturas')}>
          ← Volver
        </Button>
        <Button onClick={() => window.print()}>Imprimir o guardar PDF</Button>
      </div>

      {data.status !== 'ISSUED' && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-warn-600/30 bg-warn-50 px-4 py-3 text-base font-semibold text-warn-600 print:hidden"
        >
          Esta factura todavía no se emitió. Lo que ves es una vista previa sin validez.
        </p>
      )}

      <article className="border border-ink-900 bg-white text-ink-900">
        {/* Header: issuer on the left, the type letter in the middle, the
            document identity on the right. The layout ARCA expects. */}
        <header className="relative grid grid-cols-2 border-b border-ink-900">
          <div className="p-5">
            <p className="text-xl font-bold">{issuer.legalName}</p>
            <p className="mt-2 text-sm">CUIT: {issuer.taxId}</p>
            <p className="text-sm">{ISSUER_CONDITIONS[issuer.taxCondition]}</p>
            {issuer.grossIncomeId && <p className="text-sm">IIBB: {issuer.grossIncomeId}</p>}
          </div>

          <div className="border-l border-ink-900 p-5 text-right">
            <p className="text-lg font-bold">{TYPE_NAMES[data.type]}</p>
            <p className="mt-2 text-sm">
              N° {data.displayNumber ?? '—'}
            </p>
            <p className="text-sm">Fecha: {data.issuedOn}</p>
          </div>

          {/* The big letter, straddling both halves. */}
          <span className="absolute left-1/2 top-0 flex size-14 -translate-x-1/2 items-center justify-center border border-ink-900 bg-white text-3xl font-bold">
            {data.type}
          </span>
        </header>

        <section className="border-b border-ink-900 p-5">
          <p className="text-base font-semibold">{data.receiverName}</p>
          <p className="text-sm">
            {data.receiverDocKind === 'SIN_IDENTIFICAR'
              ? 'Sin identificar'
              : `${data.receiverDocKind}: ${data.receiverDocNumber}`}
          </p>
          <p className="text-sm">{RECEIVER_CONDITIONS[data.receiverTaxCondition]}</p>
          {data.receiverAddress && <p className="text-sm">{data.receiverAddress}</p>}
        </section>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-900 text-left">
              <th className="p-3 font-semibold">Descripción</th>
              <th className="p-3 text-right font-semibold">Cant.</th>
              <th className="p-3 text-right font-semibold">P. unitario</th>
              {discriminatesVat && <th className="p-3 text-right font-semibold">IVA</th>}
              <th className="p-3 text-right font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id} className="border-b border-line">
                <td className="p-3">{item.description}</td>
                <td className="p-3 text-right tabular-nums">{item.quantity}</td>
                <td className="p-3 text-right tabular-nums">{formatMoney(item.unitPrice)}</td>
                {discriminatesVat && (
                  <td className="p-3 text-right tabular-nums">{item.vatRate}%</td>
                )}
                <td className="p-3 text-right tabular-nums">{formatMoney(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="flex justify-end border-b border-ink-900 p-5">
          <div className="w-64">
            {/* A C invoice shows only the total: showing a "subtotal" and a
                zero VAT line would suggest a breakdown that does not exist. */}
            {discriminatesVat && (
              <>
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(data.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>IVA</span>
                  <span className="tabular-nums">{formatMoney(data.vatAmount)}</span>
                </div>
              </>
            )}
            <div className="mt-1 flex justify-between border-t border-ink-900 pt-1 text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(data.total, data.currency)}</span>
            </div>
          </div>
        </section>

        <footer className="flex items-end justify-between gap-5 p-5">
          <div>
            {qr && <img src={qr} alt="Código QR de ARCA" className="size-32" />}
          </div>

          <div className="text-right text-sm">
            {data.cae ? (
              <>
                <p className="font-semibold">CAE N°: {data.cae}</p>
                <p>Fecha de vencimiento del CAE: {data.caeExpiresOn}</p>
              </>
            ) : (
              <p className="font-semibold text-danger-600">Sin CAE — documento no emitido</p>
            )}
          </div>
        </footer>
      </article>
    </div>
  );
}
