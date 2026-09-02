import { useEffect, useState } from 'react';
import type { PatientDto } from '@avisar/shared';
import { ApiError } from '../../lib/api';
import { useDeletePatient, usePatients, useSavePatient } from '../../lib/queries';
import { Button } from '../../components/ui/Button';
import { Checkbox, TextAreaField, TextField } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { EmptyState, ErrorNotice, Loading } from '../../components/ui/Feedback';
import { useDebounced } from '../../lib/useDebounced';

export function PatientsPage() {
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PatientDto | null>(null);

  const patients = usePatients(useDebounced(search));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">Pacientes</h1>
          <p className="mt-0.5 text-base text-ink-500">
            {patients.data ? `${patients.data.total} en total` : 'Cargando…'}
          </p>
        </div>

        <Button
          size="lg"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          + Nuevo paciente
        </Button>
      </header>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar por nombre o teléfono"
        className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink-900 placeholder:text-ink-300"
      />

      {patients.isLoading && <Loading label="Cargando pacientes…" />}

      {patients.data?.items.length === 0 && (
        <EmptyState
          title={search ? 'No encontramos a nadie' : 'Todavía no cargaste pacientes'}
          description={
            search
              ? 'Probá con otro nombre o con el número de teléfono.'
              : 'Cargá tu primer paciente para poder darle un turno.'
          }
          action={
            !search && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setSheetOpen(true);
                }}
              >
                Cargar paciente
              </Button>
            )
          }
        />
      )}

      {patients.data && patients.data.items.length > 0 && (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface">
          {patients.data.items.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                onClick={() => {
                  setEditing(patient);
                  setSheetOpen(true);
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-brand-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-base font-medium text-ink-900">
                    {patient.fullName}
                  </span>
                  <span className="block truncate text-sm text-ink-500">{patient.phoneDisplay}</span>
                </span>

                {!patient.whatsappOptIn && (
                  <span className="shrink-0 rounded-full bg-line-soft px-2.5 py-1 text-xs font-semibold text-ink-500">
                    Sin WhatsApp
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <PatientSheet open={sheetOpen} patient={editing} onClose={() => setSheetOpen(false)} />
    </div>
  );
}

interface PatientSheetProps {
  open: boolean;
  patient: PatientDto | null;
  onClose(): void;
}

function PatientSheet({ open, patient, onClose }: PatientSheetProps) {
  const savePatient = useSavePatient();
  const deletePatient = useDeletePatient();

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    notes: '',
    whatsappOptIn: true,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);

    setForm({
      fullName: patient?.fullName ?? '',
      phone: patient?.phoneE164 ?? '',
      email: patient?.email ?? '',
      notes: patient?.notes ?? '',
      whatsappOptIn: patient?.whatsappOptIn ?? true,
    });
  }, [open, patient]);

  const update = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  async function save() {
    setError(null);

    try {
      await savePatient.mutateAsync({
        ...(patient ? { id: patient.id } : {}),
        fullName: form.fullName,
        phone: form.phone,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
        whatsappOptIn: form.whatsappOptIn,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos guardar el paciente.');
    }
  }

  async function remove() {
    if (!patient) return;
    setError(null);

    try {
      await deletePatient.mutateAsync(patient.id);
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos borrar el paciente.');
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={patient ? 'Editar paciente' : 'Nuevo paciente'}
      footer={
        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            fullWidth
            loading={savePatient.isPending}
            disabled={form.fullName.trim().length < 2 || form.phone.trim().length < 6}
            onClick={() => void save()}
          >
            Guardar
          </Button>

          {patient && (
            <Button variant="danger" fullWidth loading={deletePatient.isPending} onClick={() => void remove()}>
              Borrar paciente
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <ErrorNotice message={error} />}

        <TextField label="Nombre y apellido" required value={form.fullName} onChange={update('fullName')} />

        <TextField
          label="WhatsApp"
          type="tel"
          inputMode="tel"
          placeholder="11 4444-5555"
          hint="Escribilo como quieras: nosotros lo ordenamos."
          required
          value={form.phone}
          onChange={update('phone')}
        />

        <TextField
          label="Correo electrónico"
          type="email"
          inputMode="email"
          hint="Opcional."
          value={form.email}
          onChange={update('email')}
        />

        <Checkbox
          label="Enviarle recordatorios por WhatsApp"
          hint="Si lo desmarcás, este paciente deja de recibir mensajes automáticos."
          checked={form.whatsappOptIn}
          onChange={(event) =>
            setForm((current) => ({ ...current, whatsappOptIn: event.target.checked }))
          }
        />

        <TextAreaField
          label="Notas"
          hint="Opcional. El paciente no las ve."
          value={form.notes}
          onChange={update('notes')}
        />
      </div>
    </Sheet>
  );
}
