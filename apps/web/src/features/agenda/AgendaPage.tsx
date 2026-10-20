import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppointmentDto } from '@avisar/shared';
import {
  useAppointments,
  useConfirmAppointment,
  useProfessionals,
  useProviderStatus,
} from '../../lib/queries';
import { Button } from '../../components/ui/Button';
import { AppointmentBadge, EmptyState, InfoNotice, Loading } from '../../components/ui/Feedback';
import { AppointmentSheet } from './AppointmentSheet';
import { useIsSolo } from '../../lib/useAccountMode';
import {
  addDays,
  capitalize,
  endOfDay,
  endOfWeek,
  formatDayMonthShort,
  formatTime,
  formatWeekdayShort,
  friendlyDay,
  startOfDay,
  startOfWeek,
  toDateInputValue,
} from '../../lib/format';

type View = 'day' | 'week';

export function AgendaPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('day');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [professionalFilter, setProfessionalFilter] = useState<string>('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentDto | null>(null);
  // Separate from `anchor`: that one is normalized to midnight to drive the
  // range query, so it cannot also carry the hour the user clicked on.
  const [pendingStart, setPendingStart] = useState<Date | null>(null);

  const professionals = useProfessionals();
  const provider = useProviderStatus();
  const isSolo = useIsSolo();

  const range = useMemo(
    () =>
      view === 'day'
        ? { from: startOfDay(anchor), to: endOfDay(anchor) }
        : { from: startOfWeek(anchor), to: endOfWeek(anchor) },
    [view, anchor],
  );

  const appointments = useAppointments(range.from, range.to, professionalFilter || undefined);

  const days = useMemo(() => {
    const source = appointments.data ?? [];
    const buckets = new Map<string, AppointmentDto[]>();

    // Empty buckets for the whole week keep the layout stable instead of
    // collapsing days that happen to have nothing booked.
    const dayCount = view === 'day' ? 1 : 7;
    for (let index = 0; index < dayCount; index += 1) {
      buckets.set(toDateInputValue(addDays(range.from, index)), []);
    }

    for (const appointment of source) {
      const key = toDateInputValue(appointment.startsAt);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(appointment);
      else buckets.set(key, [appointment]);
    }

    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [appointments.data, range.from, view]);

  const hasProfessionals = (professionals.data?.length ?? 0) > 0;

  function openNew(startsAt?: Date) {
    setEditing(null);
    setPendingStart(startsAt ?? null);
    setSheetOpen(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">Agenda</h1>
          <p className="mt-0.5 text-base text-ink-500">
            {view === 'day'
              ? friendlyDay(anchor)
              : `Semana del ${formatDayMonthShort(range.from)} al ${formatDayMonthShort(addDays(range.to, -1))}`}
          </p>
        </div>

        <Button size="lg" onClick={() => openNew()} disabled={!hasProfessionals}>
          + Nuevo turno
        </Button>
      </header>

      {provider.data && !provider.data.live && (
        <InfoNotice>
          {provider.data.name === 'unavailable' ? (
            <>
              <strong className="font-semibold">Recordatorios no disponibles.</strong> Los turnos se
              guardan, pero el servicio de WhatsApp no puede enviar recordatorios por el momento.
            </>
          ) : (
            <>
              <strong className="font-semibold">Modo de prueba.</strong> Los recordatorios se programan
              normalmente, pero todavía no llegan al paciente.
            </>
          )}
        </InfoNotice>
      )}

      {!isSolo && !hasProfessionals && !professionals.isLoading && (
        <EmptyState
          title="Primero cargá un profesional"
          description="La agenda necesita saber quién atiende antes de poder tomar turnos."
          action={
            <Button onClick={() => navigate('/profesionales')}>Cargar profesional</Button>
          }
        />
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-line bg-surface p-1">
          {(['day', 'week'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              className={[
                'min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors',
                view === option ? 'bg-brand-500 text-white' : 'text-ink-700',
              ].join(' ')}
            >
              {option === 'day' ? 'Día' : 'Semana'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => setAnchor(addDays(anchor, view === 'day' ? -1 : -7))}
            className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-lg text-ink-700"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setAnchor(startOfDay(new Date()))}
            className="min-h-11 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink-700"
          >
            Hoy
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={() => setAnchor(addDays(anchor, view === 'day' ? 1 : 7))}
            className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-lg text-ink-700"
          >
            ›
          </button>
        </div>

        {!isSolo && (professionals.data?.length ?? 0) > 1 && (
          <select
            value={professionalFilter}
            onChange={(event) => setProfessionalFilter(event.target.value)}
            className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink-700"
          >
            <option value="">Todos los profesionales</option>
            {professionals.data?.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.fullName}
              </option>
            ))}
          </select>
        )}
      </div>

      {appointments.isLoading && <Loading label="Cargando la agenda…" />}

      {appointments.data && (
        <div
          className={
            view === 'week'
              ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
              : 'flex flex-col gap-3'
          }
        >
          {days.map(([key, items]) => (
            <DayColumn
              key={key}
              date={new Date(`${key}T00:00:00`)}
              appointments={items}
              compact={view === 'week'}
              onSelect={(appointment) => {
                setEditing(appointment);
                setPendingStart(null);
                setSheetOpen(true);
              }}
              onAdd={() => openNew(new Date(`${key}T09:00:00`))}
              canAdd={hasProfessionals}
            />
          ))}
        </div>
      )}

      <AppointmentSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        professionals={professionals.data ?? []}
        appointment={editing}
        defaultStartsAt={pendingStart ?? defaultStartFor(anchor)}
        defaultProfessionalId={professionalFilter || undefined}
      />
    </div>
  );
}

/**
 * Opening the form on another day should land on a plausible working hour,
 * not on 00:00. Today keeps the next round hour, which is the useful default
 * when someone books while the patient is standing at the desk.
 */
function defaultStartFor(day: Date): Date {
  const now = new Date();
  if (toDateInputValue(day) === toDateInputValue(now)) {
    const next = new Date(now);
    next.setHours(next.getHours() + 1, 0, 0, 0);
    return next;
  }

  const start = new Date(day);
  start.setHours(9, 0, 0, 0);
  return start;
}

interface DayColumnProps {
  date: Date;
  appointments: AppointmentDto[];
  compact: boolean;
  canAdd: boolean;
  onSelect(appointment: AppointmentDto): void;
  onAdd(): void;
}

function DayColumn({ date, appointments, compact, canAdd, onSelect, onAdd }: DayColumnProps) {
  const isToday = toDateInputValue(date) === toDateInputValue(new Date());

  return (
    <section
      className={[
        'flex flex-col gap-2 rounded-2xl border bg-surface p-4',
        isToday ? 'border-brand-500' : 'border-line',
      ].join(' ')}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-ink-900">
          {compact
            ? `${capitalize(formatWeekdayShort(date))} ${formatDayMonthShort(date)}`
            : friendlyDay(date)}
        </h2>
        <span className="text-sm text-ink-500">
          {appointments.length === 0
            ? 'Sin turnos'
            : `${appointments.length} turno${appointments.length === 1 ? '' : 's'}`}
        </span>
      </header>

      {appointments.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          className="rounded-xl border border-dashed border-line py-6 text-sm font-medium text-ink-500 hover:border-brand-500 hover:text-brand-700 disabled:opacity-50"
        >
          + Agregar turno
        </button>
      ) : (
        <ul className="flex flex-col gap-2">
          {appointments.map((appointment) => (
            <li key={appointment.id}>
              <AppointmentRow appointment={appointment} onSelect={onSelect} compact={compact} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AppointmentRow({
  appointment,
  compact,
  onSelect,
}: {
  appointment: AppointmentDto;
  compact: boolean;
  onSelect(appointment: AppointmentDto): void;
}) {
  const confirm = useConfirmAppointment();
  // Printing the owner's own name on every row of their own agenda is noise.
  const showProfessional = !useIsSolo();
  const cancelled = appointment.status === 'CANCELLED';

  return (
    <div
      className={[
        'flex items-stretch gap-3 rounded-xl border border-line bg-surface transition-colors hover:border-brand-500',
        cancelled ? 'opacity-55' : '',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className="w-1.5 shrink-0 rounded-l-xl"
        style={{ backgroundColor: appointment.professional.color }}
      />

      <button
        type="button"
        onClick={() => onSelect(appointment)}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 py-3 pr-3 text-left"
      >
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-lg font-bold tabular-nums text-ink-900">
            {formatTime(appointment.startsAt)}
          </span>
          <AppointmentBadge status={appointment.status} />
        </div>

        <span className={`truncate text-base font-medium text-ink-900 ${cancelled ? 'line-through' : ''}`}>
          {appointment.patient.fullName}
        </span>

        {!compact && (
          <span className="truncate text-sm text-ink-500">
            {showProfessional ? `${appointment.professional.fullName} · ` : ''}
            {appointment.durationMin} min
          </span>
        )}
      </button>

      {appointment.status === 'PENDING' && (
        <button
          type="button"
          onClick={() => confirm.mutate(appointment.id)}
          disabled={confirm.isPending}
          title="Marcar como confirmado"
          className="shrink-0 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          ✓
        </button>
      )}
    </div>
  );
}
