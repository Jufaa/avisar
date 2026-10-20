import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { InvoiceDto } from '@avisar/shared';
import {
  useBillingProfile,
  useDeleteInvoice,
  useInvoices,
  useInvoicingStatus,
  useIssueInvoice,
} from '../../lib/queries';
import { Button } from '../../components/ui/Button';
import { EmptyState, InfoNotice, InvoiceBadge, Loading } from '../../components/ui/Feedback';
import { BillingProfileForm } from './BillingProfileForm';
import { InvoiceSheet } from './InvoiceSheet';
import { InvoiceProviderConnection } from './InvoiceProviderConnection';
import { Sheet } from '../../components/ui/Sheet';
import { formatMoney } from '../../lib/format';

export function InvoicesPage() {
  const status = useInvoicingStatus();
  const profile = useBillingProfile();
  const invoices = useInvoices();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  if (profile.isLoading || status.isLoading) return <Loading />;

  // No tax details means no invoice can be built at all, so the form is the
  // page rather than something hidden behind a settings screen.
  if (!profile.data) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <header>
          <h1 className="text-3xl font-bold text-ink-900">Facturación</h1>
          <p className="mt-0.5 text-base text-ink-500">
            Cargá tus datos fiscales una vez y ya podés facturar.
          </p>
        </header>

        <BillingProfileForm profile={null} />
      </div>
    );
  }

  const items = invoices.data?.items ?? [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">Facturación</h1>
          <p className="mt-0.5 text-base text-ink-500">
            Punto de venta {String(profile.data.salesPoint).padStart(4, '0')} ·{' '}
            {profile.data.legalName}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="lg" onClick={() => setProfileOpen(true)}>
            Datos fiscales
          </Button>
          <Button size="lg" onClick={() => setSheetOpen(true)}>
            + Nueva factura
          </Button>
        </div>
      </header>

      <InvoiceProviderConnection />

      {/* Said on the page itself, not buried in settings. */}
      {status.data && !status.data.live && (
        <InfoNotice>
          <strong className="font-semibold">{status.data.description}</strong>
        </InfoNotice>
      )}

      {invoices.isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState
          title="Todavía no facturaste nada"
          description="Armá una factura, revisá los números y recién ahí se emite."
          action={<Button onClick={() => setSheetOpen(true)}>Nueva factura</Button>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} />
          ))}
        </div>
      )}

      <InvoiceSheet
        open={sheetOpen}
        profile={profile.data}
        onClose={() => setSheetOpen(false)}
      />

      <Sheet
        open={profileOpen}
        title="Datos fiscales"
        description="Cambiarlos no toca las facturas ya emitidas: cada una guarda los datos que tenía el día que se emitió."
        onClose={() => setProfileOpen(false)}
      >
        <BillingProfileForm profile={profile.data} onSaved={() => setProfileOpen(false)} />
      </Sheet>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: InvoiceDto }) {
  const issue = useIssueInvoice();
  const remove = useDeleteInvoice();

  const claimable = invoice.status === 'DRAFT' || invoice.status === 'FAILED';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-ink-900">
              {invoice.displayNumber ?? `Factura ${invoice.type}`}
            </span>
            <InvoiceBadge status={invoice.status} />
          </div>
          <p className="mt-0.5 truncate text-base text-ink-700">{invoice.receiverName}</p>
          <p className="text-sm text-ink-500">{invoice.issuedOn}</p>
        </div>

        <span className="shrink-0 text-lg font-bold tabular-nums text-ink-900">
          {formatMoney(invoice.total, invoice.currency)}
        </span>
      </div>

      {invoice.cae && (
        <p className="text-sm text-ink-500">
          CAE {invoice.cae} · vence {invoice.caeExpiresOn}
        </p>
      )}

      {invoice.error && (
        <p role="alert" className="text-sm font-medium text-danger-600">
          {invoice.error}
        </p>
      )}

      {claimable && (
        <div className="flex flex-wrap gap-2">
          <Button loading={issue.isPending} onClick={() => issue.mutate(invoice.id)}>
            {invoice.status === 'FAILED' ? 'Reintentar' : 'Emitir'}
          </Button>
          <Button
            variant="ghost"
            loading={remove.isPending}
            onClick={() => remove.mutate(invoice.id)}
          >
            Descartar
          </Button>
        </div>
      )}

      {/* Our own rendering, always available. The provider's link expires the
          same day, so it is offered as an extra rather than as the copy. */}
      <div className="flex flex-wrap gap-4">
        <Link
          to={`/facturas/${invoice.id}`}
          className="text-sm font-semibold text-brand-700"
        >
          Ver e imprimir
        </Link>

        {invoice.pdfUrl && (
          <a
            href={invoice.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-brand-700"
          >
            PDF del proveedor
          </a>
        )}
      </div>
    </div>
  );
}
