import { useEffect, useState } from 'react';
import type { AppointmentDto, PatientDto, ProfessionalDto } from '@avisar/shared';
import { ApiError } from '../../lib/api';
import {
  useCancelAppointment,
  useCreateAppointment,
  usePatients,
  useReminderRules,
  useUpdateAppointment,
} from '../../lib/queries';
import { Button } from '../../components/ui/Button';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { ErrorNotice, NotificationBadge } from '../../components/ui/Feedback';
import { formatFull, toDateTimeLocalValue } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
import { useIsSolo } from '../../lib/useAccountMode';

interface AppointmentSheetProps {
  open: boolean;
  onClose(): void;
  professionals: ProfessionalDto[];
  /** Present when editing; absent when booking a new appointment. */
  appointment?: AppointmentDto | null;
  defaultStartsAt?: Date;
  defaultProfessionalId?: string;
}

export function AppointmentSheet({
  open,
  onClose,
  professionals,
  appointment,
  defaultStartsAt,
  defaultProfessionalId,
}: AppointmentSheetProps) {
  const editing = Boolean(appointment);

  const createAppointment = useCreateAppointment();
  const updateAppointment = useUpdateAppointment();
  const cancelAppointment = useCancelAppointment();

  const [search, setSearch] = useState('');
  const patients = usePatients(useDebounced(search));
  const rules = useReminderRules();
  const isSolo = useIsSolo();

  const [professionalId, setProfessionalId] = useState('');
  const [patientId, setPatientId] = useState('');
  const [newPatient, setNewPatient] = useState({ fullName: '', phone: '' });
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [durationMin, setDurationMin] = useState('30');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  // Reset every time the sheet opens, so a previous edit never bleeds into
  // the next one.
  useEffect(() => {
    if (!open) return;

    setError(null);
    setOverlapWarning(null);
    setSearch('');

    if (appointment) {
      setProfessionalId(appointment.professional.id);
      setPatientId(appointment.patient.id);
      setStartsAt(toDateTimeLocalValue(appointment.startsAt));
      setDurationMin(String(appointment.durationMin));
      setNotes(appointment.notes ?? '');
      setCreatingPatient(false);
    } else {
      const professional =
        professionals.find((item) => item.id === defaultProfessionalId) ?? professionals[0];

      setProfessionalId(professional?.id ?? '');
      setPatientId('');
      setNewPatient({ fullName: '', phone: '' });
      setCreatingPatient(false);
      setStartsAt(toDateTimeLocalValue(defaultStartsAt ?? nextRoundHour()));
      setDurationMin(String(professional?.defaultDurationMin ?? 30));
      setNotes('');
    }
  }, [open, appointment, defaultStartsAt, defaultProfessionalId, professionals]);

  async function save(allowOverlap = false) {
    setError(null);

    const payload = {
      professionalId,
      startsAt: new Date(startsAt).toISOString(),
      durationMin: Number(durationMin),
      notes: notes.trim() || null,
      allowOverlap,
      ...(creatingPatient ? { newPatient } : { patientId }),
    };

    try {
      if (appointment) {
        await updateAppointment.mutateAsync({ id: appointment.id, ...payload });
      } else {
        await createAppointment.mutateAsync(payload);
      }
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'CONFLICT') {
        // Not a hard block: practices double-book on purpose sometimes.
        setOverlapWarning(caught.message);
        return;
      }
      setError(caught instanceof ApiError ? caught.message : 'No pudimos guardar el turno.');
    }
  }

  /**
   * Booking inside the reminder window is legitimate — a patient standing at
   * the desk gets an appointment for this afternoon. What is not acceptable is
   * letting the practice assume a reminder will go out when it cannot.
   */
  const reminderWarning = (() => {
    if (!startsAt) return null;

    const enabled = (rules.data ?? []).filter((rule) => rule.enabled);
    if (enabled.length === 0) return 'No tenés ningún aviso configurado, así que este turno no lleva recordatorio.';

    const soonest = Math.min(...enabled.map((rule) => rule.hoursBefore));
    const when = new Date(startsAt).getTime();
    if (Number.isNaN(when)) return null;

    const firstReminderAt = when - soonest * 3_600_000;
    if (firstReminderAt > Date.now()) return null;

    const label = soonest >= 24 ? `${soonest / 24} día(s)` : `${soonest} hora(s)`;
    return `Este turno es dentro de menos de ${label}, así que no se va a enviar recordatorio automático. Avisale al paciente por otro medio.`;
  })();

  const selectedPatient =
    patients.data?.items.find((option) => option.id === patientId) ??
    (appointment && appointment.patient.id === patientId ? appointment.patient : undefined);

  const busy = createAppointment.isPending || updateAppointment.isPending;
  const canSave =
    professionalId.length > 0 &&
    startsAt.length > 0 &&
    (creatingPatient
      ? newPatient.fullName.trim().length >= 2 && newPatient.phone.trim().length >= 6
      : patientId.length > 0);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Editar turno' : 'Nuevo turno'}
      description={editing ? formatFull(appointment!.startsAt) : undefined}
      footer={
        <div className="flex flex-col gap-3">
          {overlapWarning && (
            <div className="rounded-xl border border-warn-600/30 bg-warn-50 px-4 py-3 text-sm text-warn-600">
              <p className="font-semibold">{overlapWarning}</p>
              <button
                type="button"
                onClick={() => void save(true)}
                className="mt-1 font-semibold underline"
              >
                Guardarlo igual
              </button>
            </div>
          )}

          <Button size="lg" fullWidth loading={busy} disabled={!canSave} onClick={() => void save()}>
            {editing ? 'Guardar cambios' : 'Crear turno'}
          </Button>

          {editing && appointment!.status !== 'CANCELLED' && (
            <Button
              variant="danger"
              fullWidth
              loading={cancelAppointment.isPending}
              onClick={() => {
                void cancelAppointment.mutateAsync({ id: appointment!.id }).then(onClose);
              }}
            >
              Cancelar turno
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <ErrorNotice message={error} />}

        {/* A solo account has one agenda, so there is nothing to choose. */}
        {!isSolo && (
          <SelectField
            label="Profesional"
            value={professionalId}
            onChange={(event) => {
              setProfessionalId(event.target.value);
              const chosen = professionals.find((item) => item.id === event.target.value);
              if (chosen && !editing) setDurationMin(String(chosen.defaultDurationMin));
            }}
          >
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.fullName}
              </option>
            ))}
          </SelectField>
        )}

        {creatingPatient ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-brand-100 bg-brand-50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-700">Paciente nuevo</p>
              <button
                type="button"
                onClick={() => setCreatingPatient(false)}
                className="text-sm font-medium text-ink-500 underline"
              >
                Buscar uno existente
              </button>
            </div>

            <TextField
              label="Nombre"
              value={newPatient.fullName}
              onChange={(event) =>
                setNewPatient((current) => ({ ...current, fullName: event.target.value }))
              }
            />
            <TextField
              label="WhatsApp"
              type="tel"
              inputMode="tel"
              placeholder="11 4444-5555"
              value={newPatient.phone}
              onChange={(event) => setNewPatient((current) => ({ ...current, phone: event.target.value }))}
            />
          </div>
        ) : selectedPatient ? (
          // Once a patient is chosen the list collapses into the answer.
          // Leaving twenty names on screen after the choice is made hides the
          // rest of the form and makes the decision look unconfirmed.
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink-700">Paciente</span>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-500 bg-brand-50 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate text-base font-medium text-ink-900">
                  {selectedPatient.fullName}
                </span>
                <span className="block truncate text-sm text-ink-500">{selectedPatient.phoneDisplay}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setPatientId('');
                  setSearch('');
                }}
                className="shrink-0 text-sm font-semibold text-brand-700 underline"
              >
                Cambiar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <TextField
              label="Paciente"
              placeholder="Buscar por nombre o teléfono"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className="max-h-52 overflow-y-auto rounded-xl border border-line">
              {(patients.data?.items ?? []).map((option: PatientDto) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPatientId(option.id)}
                  className="flex w-full flex-col items-start gap-0.5 border-b border-line-soft px-4 py-3 text-left last:border-b-0 hover:bg-line-soft"
                >
                  <span className="text-base font-medium text-ink-900">{option.fullName}</span>
                  <span className="text-sm text-ink-500">{option.phoneDisplay}</span>
                </button>
              ))}

              {patients.data && patients.data.items.length === 0 && (
                <p className="px-4 py-4 text-sm text-ink-500">No encontramos pacientes con ese nombre.</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setCreatingPatient(true)}
              className="self-start text-sm font-semibold text-brand-700 underline"
            >
              + Cargar un paciente nuevo
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <TextField
            label="Día y hora"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />

          {reminderWarning && (
            <p className="rounded-xl border border-warn-600/30 bg-warn-50 px-4 py-3 text-sm text-warn-600">
              {reminderWarning}
            </p>
          )}
        </div>

        <SelectField
          label="Duración"
          value={durationMin}
          onChange={(event) => setDurationMin(event.target.value)}
        >
          <option value="15">15 minutos</option>
          <option value="30">30 minutos</option>
          <option value="45">45 minutos</option>
          <option value="60">1 hora</option>
          <option value="90">1 hora y media</option>
        </SelectField>

        <TextAreaField
          label="Notas"
          hint="Opcional. El paciente no las ve."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        {editing && appointment!.reminders.length === 0 && appointment!.status !== 'CANCELLED' && (
          <p className="rounded-2xl border border-line bg-ground p-4 text-sm text-ink-500">
            Este turno no tiene recordatorios programados. Suele pasar cuando se carga con menos
            antelación que el aviso configurado.
          </p>
        )}

        {editing && appointment!.reminders.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-ground p-4">
            <p className="text-sm font-semibold text-ink-700">Recordatorios</p>
            {appointment!.reminders.map((reminder) => (
              <div key={reminder.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink-500">{formatFull(reminder.scheduledFor)}</span>
                <NotificationBadge status={reminder.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function nextRoundHour(): Date {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return date;
}
