import { useMemo, useState } from 'react';
import type { BillingProfileDto, InvoiceDto } from '@avisar/shared';
import { useDraftInvoice, useIssueInvoice, usePatients } from '../../lib/queries';
import { ApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { ErrorNotice, InfoNotice } from '../../components/ui/Feedback';
import { formatMoney } from '../../lib/format';

interface LineDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
}

const EMPTY_LINE: LineDraft = { description: '', quantity: '1', unitPrice: '', vatRate: '21' };

/**
 * Two steps, never one.
 *
 * Step one fills the numbers; step two shows them and asks. That split is the
 * whole safety story of this screen: a fiscal document is legally binding, and
 * nothing that binding should be one accidental click away — least of all when
 * the fields were filled by dictation or by a model rather than typed.
 */
export function InvoiceSheet({
  open,
  profile,
  onClose,
}: {
  open: boolean;
  profile: BillingProfileDto;
  onClose(): void;
}) {
  const draft = useDraftInvoice();
  const issue = useIssueInvoice();
  const patients = usePatients('');

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<InvoiceDto | null>(null);

  const [receiverName, setReceiverName] = useState('');
  const [receiverDocKind, setReceiverDocKind] = useState('DNI');
  const [receiverDocNumber, setReceiverDocNumber] = useState('');
  const [receiverTaxCondition, setReceiverTaxCondition] = useState('CONSUMIDOR_FINAL');
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);

  // Shown live so nobody presses "Revisar" to find out what it costs. The API
  // recalculates it anyway — this is a preview, never the source of truth.
  const preview = useMemo(() => {
    const discriminatesVat = profile.taxCondition === 'RESPONSABLE_INSCRIPTO';

    return lines.reduce(
      (totals, line) => {
        const subtotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
        const vat = discriminatesVat ? subtotal * ((Number(line.vatRate) || 0) / 100) : 0;
        return { subtotal: totals.subtotal + subtotal, vat: totals.vat + vat };
      },
      { subtotal: 0, vat: 0 },
    );
  }, [lines, profile.taxCondition]);

  function updateLine(index: number, key: keyof LineDraft, value: string) {
    setLines((current) =>
      current.map((line, position) => (position === index ? { ...line, [key]: value } : line)),
    );
  }

  function reset() {
    setReceiverName('');
    setReceiverDocNumber('');
    setReceiverDocKind('DNI');
    setReceiverTaxCondition('CONSUMIDOR_FINAL');
    setLines([{ ...EMPTY_LINE }]);
    setPending(null);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  function review(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    draft.mutate(
      {
        receiverName,
        receiverDocKind,
        receiverDocNumber,
        receiverTaxCondition,
        lines: lines.map((line) => ({
          description: line.description,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          vatRate: Number(line.vatRate),
        })),
      },
      {
        onSuccess: (created) => setPending(created),
        onError: (caught) =>
          setError(caught instanceof ApiError ? caught.message : 'No pudimos armar la factura.'),
      },
    );
  }

  function confirm() {
    if (!pending) return;
    setError(null);

    issue.mutate(pending.id, {
      onSuccess: (issued) => {
        if (issued.status === 'ISSUED') {
          close();
          return;
        }
        // Rejected by ARCA. The draft survives with the reason attached, so
        // the fix is one correction away rather than a retype.
        setError(issued.error ?? 'ARCA rechazó la factura.');
        setPending(issued);
      },
      onError: (caught) =>
        setError(caught instanceof ApiError ? caught.message : 'No pudimos emitir la factura.'),
    });
  }

  return (
    <Sheet
      open={open}
      title={pending ? 'Revisá antes de emitir' : 'Nueva factura'}
      description={
        pending
          ? 'Una vez emitida no se puede editar ni borrar: se corrige con una nota de crédito.'
          : undefined
      }
      onClose={close}
      footer={
        pending ? (
          <div className="flex flex-col gap-2">
            <Button size="lg" fullWidth loading={issue.isPending} onClick={confirm}>
              Confirmar y emitir
            </Button>
            <Button variant="ghost" fullWidth onClick={() => setPending(null)}>
              Volver a editar
            </Button>
          </div>
        ) : undefined
      }
    >
      {error && <ErrorNotice message={error} />}

      {pending ? (
        <InvoiceReview invoice={pending} />
      ) : (
        <form onSubmit={review} className="flex flex-col gap-4">
          <SelectField
            label="Condición del cliente"
            value={receiverTaxCondition}
            onChange={(event) => setReceiverTaxCondition(event.target.value)}
            hint={
              profile.taxCondition === 'RESPONSABLE_INSCRIPTO'
                ? 'Un responsable inscripto recibe factura A; el resto, B.'
                : 'Como monotributista emitís factura C en todos los casos.'
            }
          >
            <option value="CONSUMIDOR_FINAL">Consumidor final</option>
            <option value="RESPONSABLE_INSCRIPTO">Responsable inscripto</option>
            <option value="MONOTRIBUTO">Monotributo</option>
            <option value="EXENTO">Exento</option>
          </SelectField>

          <TextField
            label="Nombre o razón social"
            list="invoice-patients"
            value={receiverName}
            onChange={(event) => setReceiverName(event.target.value)}
            required
          />
          {/* The people already in the agenda, without turning this into a
              patient picker: most invoices go to someone already known. */}
          <datalist id="invoice-patients">
            {(patients.data?.items ?? []).map((patient) => (
              <option key={patient.id} value={patient.fullName} />
            ))}
          </datalist>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Documento"
              value={receiverDocKind}
              onChange={(event) => setReceiverDocKind(event.target.value)}
            >
              <option value="DNI">DNI</option>
              <option value="CUIT">CUIT</option>
              <option value="CUIL">CUIL</option>
              <option value="SIN_IDENTIFICAR">Sin identificar</option>
            </SelectField>

            <TextField
              label="Número"
              inputMode="numeric"
              value={receiverDocNumber}
              onChange={(event) => setReceiverDocNumber(event.target.value)}
              disabled={receiverDocKind === 'SIN_IDENTIFICAR'}
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-semibold text-ink-700">Detalle</legend>

            {lines.map((line, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-xl border border-line p-3">
                <TextField
                  label="Concepto"
                  placeholder="Sesión de kinesiología"
                  value={line.description}
                  onChange={(event) => updateLine(index, 'description', event.target.value)}
                  required
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField
                    label="Cantidad"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) => updateLine(index, 'quantity', event.target.value)}
                  />
                  <TextField
                    label="Precio sin IVA"
                    inputMode="decimal"
                    value={line.unitPrice}
                    onChange={(event) => updateLine(index, 'unitPrice', event.target.value)}
                    required
                  />
                  {/* A C invoice never discriminates VAT, so asking for a rate
                      would be asking a question with no effect. */}
                  {profile.taxCondition === 'RESPONSABLE_INSCRIPTO' && (
                    <SelectField
                      label="IVA"
                      value={line.vatRate}
                      onChange={(event) => updateLine(index, 'vatRate', event.target.value)}
                    >
                      <option value="21">21%</option>
                      <option value="10.5">10,5%</option>
                      <option value="27">27%</option>
                      <option value="0">0%</option>
                    </SelectField>
                  )}
                </div>

                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    className="self-start text-sm font-medium text-danger-600"
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="secondary"
              onClick={() => setLines((current) => [...current, { ...EMPTY_LINE }])}
            >
              + Agregar concepto
            </Button>
          </fieldset>

          <div className="rounded-xl bg-brand-50 px-4 py-3">
            <div className="flex justify-between text-base text-ink-700">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(preview.subtotal)}</span>
            </div>
            {profile.taxCondition === 'RESPONSABLE_INSCRIPTO' && (
              <div className="flex justify-between text-base text-ink-700">
                <span>IVA</span>
                <span className="tabular-nums">{formatMoney(preview.vat)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between text-lg font-bold text-ink-900">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(preview.subtotal + preview.vat)}</span>
            </div>
          </div>

          <Button type="submit" size="lg" loading={draft.isPending}>
            Revisar
          </Button>
        </form>
      )}
    </Sheet>
  );
}

/** The numbers as they will be issued, with nothing editable. */
function InvoiceReview({ invoice }: { invoice: InvoiceDto }) {
  return (
    <div className="flex flex-col gap-4">
      <InfoNotice>
        Vas a emitir una <strong className="font-semibold">factura {invoice.type}</strong> a nombre
        de {invoice.receiverName}.
      </InfoNotice>

      <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
        {invoice.items.map((item) => (
          <div key={item.id} className="flex justify-between gap-3 text-base">
            <span className="min-w-0 truncate text-ink-700">
              {item.quantity} × {item.description}
            </span>
            <span className="shrink-0 tabular-nums text-ink-900">{formatMoney(item.total)}</span>
          </div>
        ))}

        <div className="mt-2 border-t border-line-soft pt-2">
          <div className="flex justify-between text-base text-ink-700">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(invoice.subtotal)}</span>
          </div>
          {invoice.vatAmount > 0 && (
            <div className="flex justify-between text-base text-ink-700">
              <span>IVA</span>
              <span className="tabular-nums">{formatMoney(invoice.vatAmount)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between text-xl font-bold text-ink-900">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(invoice.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
