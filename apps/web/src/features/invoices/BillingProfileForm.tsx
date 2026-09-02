import { useState } from 'react';
import type { BillingProfileDto } from '@avisar/shared';
import { useSaveBillingProfile } from '../../lib/queries';
import { ApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';
import { ErrorNotice } from '../../components/ui/Feedback';

/**
 * The practice's own tax details, asked once.
 *
 * Everything here decides what the invoices will look like, so it is asked
 * before the first one rather than guessed from it. The tax condition in
 * particular is not cosmetic: it is what makes the account issue C invoices
 * instead of A and B.
 */
export function BillingProfileForm({
  profile,
  onSaved,
}: {
  profile: BillingProfileDto | null;
  onSaved?: () => void;
}) {
  const save = useSaveBillingProfile();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    taxId: profile?.taxId ?? '',
    legalName: profile?.legalName ?? '',
    taxCondition: profile?.taxCondition ?? 'MONOTRIBUTO',
    salesPoint: String(profile?.salesPoint ?? 1),
    grossIncomeId: profile?.grossIncomeId ?? '',
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    save.mutate(
      {
        taxId: form.taxId.replace(/\D/g, ''),
        legalName: form.legalName.trim(),
        taxCondition: form.taxCondition,
        salesPoint: Number(form.salesPoint),
        grossIncomeId: form.grossIncomeId.trim() || null,
      },
      {
        onSuccess: () => onSaved?.(),
        onError: (caught) =>
          setError(
            caught instanceof ApiError ? caught.message : 'No pudimos guardar los datos fiscales.',
          ),
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <ErrorNotice message={error} />}

      <TextField
        label="CUIT"
        inputMode="numeric"
        placeholder="20358418180"
        value={form.taxId}
        onChange={(event) => set('taxId', event.target.value)}
        hint="Sin guiones. Verificamos el dígito verificador antes de guardar."
        required
      />

      <TextField
        label="Razón social"
        placeholder="Como figura en ARCA"
        value={form.legalName}
        onChange={(event) => set('legalName', event.target.value)}
        required
      />

      <SelectField
        label="Condición frente al IVA"
        value={form.taxCondition}
        onChange={(event) => set('taxCondition', event.target.value)}
        hint="Define qué tipo de factura emitís: monotributo emite C; responsable inscripto, A o B."
      >
        <option value="MONOTRIBUTO">Monotributo</option>
        <option value="RESPONSABLE_INSCRIPTO">Responsable inscripto</option>
        <option value="EXENTO">Exento</option>
      </SelectField>

      <TextField
        label="Punto de venta"
        inputMode="numeric"
        value={form.salesPoint}
        onChange={(event) => set('salesPoint', event.target.value)}
        hint="El que tenés habilitado en ARCA. La numeración corre por punto de venta."
        required
      />

      <TextField
        label="Ingresos brutos (opcional)"
        value={form.grossIncomeId}
        onChange={(event) => set('grossIncomeId', event.target.value)}
      />

      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar datos fiscales
      </Button>
    </form>
  );
}
