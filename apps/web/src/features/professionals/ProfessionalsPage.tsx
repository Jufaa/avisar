import { useEffect, useState } from 'react';
import type { ProfessionalDto } from '@avisar/shared';
import { ApiError } from '../../lib/api';
import { useArchiveProfessional, useProfessionals, useSaveProfessional } from '../../lib/queries';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { EmptyState, ErrorNotice, Loading } from '../../components/ui/Feedback';

const COLORS = ['#1F6E4E', '#2C5F8A', '#8A5A2C', '#6B4A8A', '#9E3A31', '#3C6E6E'];

export function ProfessionalsPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ProfessionalDto | null>(null);

  const professionals = useProfessionals();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">Profesionales</h1>
          <p className="mt-0.5 text-base text-ink-500">Cada uno tiene su propia agenda.</p>
        </div>

        <Button
          size="lg"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          + Nuevo profesional
        </Button>
      </header>

      {professionals.isLoading && <Loading />}

      {professionals.data?.length === 0 && (
        <EmptyState
          title="Todavía no cargaste profesionales"
          description="Cargá a quien atiende. No necesitan una cuenta propia: vos gestionás sus agendas."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            >
              Cargar profesional
            </Button>
          }
        />
      )}

      {professionals.data && professionals.data.length > 0 && (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface">
          {professionals.data.map((professional) => (
            <li key={professional.id}>
              <button
                type="button"
                onClick={() => {
                  setEditing(professional);
                  setSheetOpen(true);
                }}
                className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-brand-50"
              >
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: professional.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium text-ink-900">
                    {professional.fullName}
                  </span>
                  <span className="block truncate text-sm text-ink-500">
                    {professional.specialty ?? 'Sin especialidad'} · {professional.defaultDurationMin} min
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ProfessionalSheet
        open={sheetOpen}
        professional={editing}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

function ProfessionalSheet({
  open,
  professional,
  onClose,
}: {
  open: boolean;
  professional: ProfessionalDto | null;
  onClose(): void;
}) {
  const saveProfessional = useSaveProfessional();
  const archiveProfessional = useArchiveProfessional();

  const [form, setForm] = useState({
    fullName: '',
    specialty: '',
    defaultDurationMin: '30',
    color: COLORS[0]!,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);

    setForm({
      fullName: professional?.fullName ?? '',
      specialty: professional?.specialty ?? '',
      defaultDurationMin: String(professional?.defaultDurationMin ?? 30),
      color: professional?.color ?? COLORS[0]!,
    });
  }, [open, professional]);

  async function save() {
    setError(null);

    try {
      await saveProfessional.mutateAsync({
        ...(professional ? { id: professional.id } : {}),
        fullName: form.fullName,
        specialty: form.specialty.trim() || null,
        defaultDurationMin: Number(form.defaultDurationMin),
        color: form.color,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos guardar.');
    }
  }

  async function archive() {
    if (!professional) return;
    setError(null);

    try {
      await archiveProfessional.mutateAsync(professional.id);
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos archivar.');
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={professional ? 'Editar profesional' : 'Nuevo profesional'}
      footer={
        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            fullWidth
            loading={saveProfessional.isPending}
            disabled={form.fullName.trim().length < 2}
            onClick={() => void save()}
          >
            Guardar
          </Button>

          {professional && (
            <Button
              variant="danger"
              fullWidth
              loading={archiveProfessional.isPending}
              onClick={() => void archive()}
            >
              Archivar
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <ErrorNotice message={error} />}

        <TextField
          label="Nombre y apellido"
          required
          value={form.fullName}
          onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
        />

        <TextField
          label="Especialidad"
          hint="Opcional."
          placeholder="Ej: Kinesiología deportiva"
          value={form.specialty}
          onChange={(event) => setForm((current) => ({ ...current, specialty: event.target.value }))}
        />

        <SelectField
          label="Duración habitual de una sesión"
          value={form.defaultDurationMin}
          onChange={(event) =>
            setForm((current) => ({ ...current, defaultDurationMin: event.target.value }))
          }
        >
          <option value="15">15 minutos</option>
          <option value="30">30 minutos</option>
          <option value="45">45 minutos</option>
          <option value="60">1 hora</option>
          <option value="90">1 hora y media</option>
        </SelectField>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-ink-700">Color en la agenda</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Color ${color}`}
                aria-pressed={form.color === color}
                onClick={() => setForm((current) => ({ ...current, color }))}
                className={[
                  'size-11 rounded-xl border-2 transition-transform',
                  form.color === color ? 'scale-110 border-ink-900' : 'border-transparent',
                ].join(' ')}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
