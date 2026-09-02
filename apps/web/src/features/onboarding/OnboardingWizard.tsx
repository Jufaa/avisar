import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  useCompleteOnboarding,
  useCreateAppointment,
  useProviderStatus,
  useSavePatient,
  useProfessionals,
  useSaveProfessional,
} from '../../lib/queries';
import { useIsSolo } from '../../lib/useAccountMode';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';
import { ErrorNotice, InfoNotice } from '../../components/ui/Feedback';
import { toDateTimeLocalValue } from '../../lib/format';

const CLINIC_STEPS = ['Profesional', 'Paciente', 'Primer turno', 'Listo'] as const;
/** A solo account already has its agenda, created with the account itself. */
const SOLO_STEPS = ['Paciente', 'Primer turno', 'Listo'] as const;

/**
 * Four steps, one decision each.
 *
 * The wizard ends with a real appointment already booked and its reminder
 * queued — the user sees the product working before they are asked to trust
 * it with their week.
 */
export function OnboardingWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const provider = useProviderStatus();
  const isSolo = useIsSolo();
  const professionals = useProfessionals();
  const STEPS = isSolo ? SOLO_STEPS : CLINIC_STEPS;

  const saveProfessional = useSaveProfessional();
  const savePatient = useSavePatient();
  const createAppointment = useCreateAppointment();
  const completeOnboarding = useCompleteOnboarding();

  const [step, setStep] = useState(isSolo ? 1 : 0);
  const [error, setError] = useState<string | null>(null);

  const [professional, setProfessional] = useState({ fullName: '', defaultDurationMin: '30' });
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const ownAgendaId = isSolo ? (professionals.data?.[0]?.id ?? null) : null;

  const [patient, setPatient] = useState({ fullName: '', phone: '' });
  const [patientId, setPatientId] = useState<string | null>(null);

  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() + 1);
  defaultStart.setHours(10, 0, 0, 0);
  const [startsAt, setStartsAt] = useState(toDateTimeLocalValue(defaultStart));
  const [remindersScheduled, setRemindersScheduled] = useState(0);

  const busy =
    saveProfessional.isPending ||
    savePatient.isPending ||
    createAppointment.isPending ||
    completeOnboarding.isPending;

  async function submitProfessional() {
    setError(null);
    try {
      const created = await saveProfessional.mutateAsync({
        fullName: professional.fullName,
        defaultDurationMin: Number(professional.defaultDurationMin),
      });
      setProfessionalId(created.id);
      setStep(1);
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function submitPatient() {
    setError(null);
    try {
      const created = await savePatient.mutateAsync(patient);
      setPatientId(created.id);
      setStep(2);
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function submitAppointment() {
    setError(null);
    const agendaId = professionalId ?? ownAgendaId;
    if (!agendaId || !patientId) return;

    try {
      const result = await createAppointment.mutateAsync({
        professionalId: agendaId,
        patientId,
        startsAt: new Date(startsAt).toISOString(),
        durationMin: Number(professional.defaultDurationMin),
      });
      setRemindersScheduled(result.remindersScheduled);
      await completeOnboarding.mutateAsync();
      setStep(3);
    } catch (caught) {
      setError(message(caught));
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          Paso {Math.min(step + (isSolo ? 0 : 1), STEPS.length)} de {STEPS.length}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-ink-900">{STEPS[isSolo ? step - 1 : step]}</h1>

        <div className="mt-4 flex gap-1.5" aria-hidden="true">
          {STEPS.map((label, index) => (
            <span
              key={label}
              className={`h-1.5 flex-1 rounded-full ${
                index <= (isSolo ? step - 1 : step) ? 'bg-brand-500' : 'bg-line'
              }`}
            />
          ))}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-5 rounded-3xl border border-line bg-surface p-6">
        {error && <ErrorNotice message={error} />}

        {step === 0 && (
          <>
            <p className="text-base text-ink-500">
              ¿Quién atiende? Puede ser tu propio nombre si trabajás solo.
            </p>

            <TextField
              label="Nombre del profesional"
              placeholder="Ej: Juan Pérez"
              required
              value={professional.fullName}
              onChange={(event) =>
                setProfessional((current) => ({ ...current, fullName: event.target.value }))
              }
            />

            <SelectField
              label="¿Cuánto dura una sesión?"
              value={professional.defaultDurationMin}
              onChange={(event) =>
                setProfessional((current) => ({ ...current, defaultDurationMin: event.target.value }))
              }
            >
              <option value="15">15 minutos</option>
              <option value="30">30 minutos</option>
              <option value="45">45 minutos</option>
              <option value="60">1 hora</option>
            </SelectField>

            <Button
              size="lg"
              fullWidth
              loading={busy}
              disabled={professional.fullName.trim().length < 2}
              onClick={() => void submitProfessional()}
            >
              Continuar
            </Button>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-base text-ink-500">
              Cargá un paciente. El número de WhatsApp es a donde va a llegar el recordatorio.
            </p>

            <TextField
              label="Nombre del paciente"
              placeholder="Ej: María Suárez"
              required
              value={patient.fullName}
              onChange={(event) => setPatient((current) => ({ ...current, fullName: event.target.value }))}
            />

            <TextField
              label="WhatsApp"
              type="tel"
              inputMode="tel"
              placeholder="11 4444-5555"
              hint="Escribilo como quieras: nosotros lo ordenamos."
              required
              value={patient.phone}
              onChange={(event) => setPatient((current) => ({ ...current, phone: event.target.value }))}
            />

            <div className="flex gap-3">
              {!isSolo && (
                <Button variant="secondary" size="lg" onClick={() => setStep(0)}>
                  Atrás
                </Button>
              )}
              <Button
                size="lg"
                fullWidth
                loading={busy}
                disabled={patient.fullName.trim().length < 2 || patient.phone.trim().length < 6}
                onClick={() => void submitPatient()}
              >
                Continuar
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-base text-ink-500">
              Último paso: elegí día y hora. El recordatorio se programa solo.
            </p>

            <TextField
              label="Día y hora del turno"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />

            <div className="flex gap-3">
              <Button variant="secondary" size="lg" onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button size="lg" fullWidth loading={busy} onClick={() => void submitAppointment()}>
                Crear turno
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5 text-center">
            <p className="text-5xl" aria-hidden="true">
              ✅
            </p>
            <h2 className="text-2xl font-bold text-ink-900">Listo, {user?.fullName}</h2>
            <p className="text-base text-ink-500">
              {remindersScheduled > 0
                ? `El turno quedó cargado y su recordatorio ya está programado. ${patient.fullName} lo va a recibir por WhatsApp 24 horas antes, sin que hagas nada.`
                : 'El turno quedó cargado. Como es muy pronto, esta vez no se programó recordatorio.'}
            </p>

            {provider.data && !provider.data.live && (
              <InfoNotice>
                Estás en modo de prueba: los mensajes todavía no llegan al paciente. Cuando conectes
                WhatsApp, empiezan a salir solos.
              </InfoNotice>
            )}

            <Button size="lg" fullWidth onClick={() => navigate('/agenda', { replace: true })}>
              Ver mi agenda
            </Button>
          </div>
        )}
      </div>

      {step < 3 && (
        <button
          type="button"
          onClick={() => {
            void completeOnboarding.mutateAsync().finally(() => navigate('/agenda', { replace: true }));
          }}
          className="mt-6 text-sm font-medium text-ink-500 underline"
        >
          Prefiero configurarlo después
        </button>
      )}
    </div>
  );
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No pudimos guardar. Probá de nuevo.';
}
