import { useEffect, useRef, useState } from 'react';
import { TEMPLATE_VARIABLES } from '@avisar/shared';
import { ApiError } from '../../lib/api';
import {
  useDeleteReminderRule,
  useNotificationLog,
  useProviderStatus,
  useReminderRules,
  useSaveReminderRule,
  useSaveTemplate,
  useSendTestMessage,
  useTemplates,
  useUpdateOrganization,
} from '../../lib/queries';
import { useAuth } from '../../lib/auth';
import { Button } from '../../components/ui/Button';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import {
  ErrorNotice,
  InfoNotice,
  Loading,
  NotificationBadge,
} from '../../components/ui/Feedback';
import { formatFull } from '../../lib/format';

const HOUR_OPTIONS = [1, 2, 3, 6, 12, 24, 48, 72];

/** Same wording in the list and in the picker, and singular when it should be. */
function describeHours(hours: number): string {
  if (hours >= 24) {
    const days = hours / 24;
    return `${days} día${days === 1 ? '' : 's'} antes`;
  }
  return `${hours} hora${hours === 1 ? '' : 's'} antes`;
}

export function RemindersPage() {
  const [tab, setTab] = useState<'settings' | 'log'>('settings');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header>
        <h1 className="text-3xl font-bold text-ink-900">Recordatorios</h1>
        <p className="mt-0.5 text-base text-ink-500">
          Cuándo se avisa y qué dice el mensaje que recibe el paciente.
        </p>
      </header>

      <ProviderCard />

      <div className="flex rounded-xl border border-line bg-surface p-1">
        {(
          [
            ['settings', 'Configuración'],
            ['log', 'Mensajes enviados'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={[
              'min-h-11 flex-1 rounded-lg px-4 text-sm font-semibold transition-colors',
              tab === value ? 'bg-brand-500 text-white' : 'text-ink-700',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'settings' ? (
        <>
          <RulesCard />
          <TemplateCard />
          <TestMessageCard />
          <AccountModeCard />
        </>
      ) : (
        <LogCard />
      )}
    </div>
  );
}

function ProviderCard() {
  const provider = useProviderStatus();
  if (!provider.data) return null;

  return (
    <div
      className={[
        'flex items-start gap-3 rounded-2xl border p-4',
        provider.data.live ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface',
      ].join(' ')}
    >
      <span aria-hidden="true" className="text-2xl">
        {provider.data.live ? '✅' : '🧪'}
      </span>
      <div>
        <p className="text-base font-semibold text-ink-900">
          {provider.data.live ? 'WhatsApp conectado' : 'Modo de prueba'}
        </p>
        <p className="mt-0.5 text-sm text-ink-500">{provider.data.description}</p>
      </div>
    </div>
  );
}

function RulesCard() {
  const rules = useReminderRules();
  const saveRule = useSaveReminderRule();
  const deleteRule = useDeleteReminderRule();
  const templates = useTemplates();

  const [error, setError] = useState<string | null>(null);
  const [newHours, setNewHours] = useState('2');

  const reminderTemplate = templates.data?.find((template) => template.kind === 'REMINDER');

  async function addRule() {
    if (!reminderTemplate) return;
    setError(null);

    try {
      await saveRule.mutateAsync({
        hoursBefore: Number(newHours),
        templateId: reminderTemplate.id,
        professionalId: null,
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === 'CONFLICT'
          ? 'Ya tenés un aviso configurado para ese momento.'
          : 'No pudimos agregar el aviso.',
      );
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-bold text-ink-900">¿Cuándo avisamos?</h2>
        <p className="mt-0.5 text-sm text-ink-500">
          Podés tener más de un aviso por turno. Se envían solos.
        </p>
      </div>

      {error && <ErrorNotice message={error} />}
      {rules.isLoading && <Loading />}

      <ul className="flex flex-col gap-2">
        {rules.data?.map((rule) => (
          <li
            key={rule.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
          >
            <span className="text-base font-medium text-ink-900">{describeHours(rule.hoursBefore)}</span>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-ink-500">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(event) =>
                    saveRule.mutate({ id: rule.id, enabled: event.target.checked })
                  }
                  className="size-5 accent-brand-500"
                />
                Activo
              </label>

              <button
                type="button"
                aria-label="Quitar aviso"
                onClick={() => deleteRule.mutate(rule.id)}
                className="text-lg text-ink-300 hover:text-danger-600"
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-end gap-3">
        <SelectField
          label="Agregar otro aviso"
          value={newHours}
          onChange={(event) => setNewHours(event.target.value)}
          className="flex-1"
        >
          {HOUR_OPTIONS.map((hours) => (
            <option key={hours} value={hours}>
              {describeHours(hours)}
            </option>
          ))}
        </SelectField>

        <Button variant="secondary" loading={saveRule.isPending} onClick={() => void addRule()}>
          Agregar
        </Button>
      </div>
    </section>
  );
}

function TemplateCard() {
  const templates = useTemplates();
  const saveTemplate = useSaveTemplate();

  const reminder = templates.data?.find((template) => template.kind === 'REMINDER');

  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const loadedId = useRef<string | null>(null);

  /**
   * Loads the stored text once per template.
   *
   * Depending on the `reminder` object instead of its id re-ran this on every
   * background refetch, so anything typed since the last refetch was silently
   * replaced mid-sentence.
   */
  useEffect(() => {
    if (!reminder || loadedId.current === reminder.id) return;
    loadedId.current = reminder.id;
    setBody(reminder.body);
  }, [reminder]);

  // The confirmation belongs to the text that was saved, not to whatever is
  // in the box now.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [saved]);

  async function save() {
    if (!reminder) return;
    setError(null);
    setSaved(false);

    try {
      await saveTemplate.mutateAsync({ id: reminder.id, body });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos guardar el mensaje.');
    }
  }

  if (templates.isLoading) return <Loading />;
  if (!reminder) return null;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-bold text-ink-900">El mensaje</h2>
        <p className="mt-0.5 text-sm text-ink-500">
          Escribilo como si le hablaras al paciente. Lo que está entre llaves se reemplaza solo.
        </p>
      </div>

      {error && <ErrorNotice message={error} />}

      <TextAreaField
        label="Texto del recordatorio"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          setSaved(false);
        }}
      />

      <div className="flex flex-wrap gap-1.5">
        {TEMPLATE_VARIABLES.map((variable) => (
          <button
            key={variable}
            type="button"
            onClick={() => {
              setBody((current) => `${current}{${variable}}`);
              setSaved(false);
            }}
            className="rounded-lg bg-line-soft px-2.5 py-1.5 font-mono text-xs text-ink-700 hover:bg-brand-100"
          >
            {`{${variable}}`}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button loading={saveTemplate.isPending} onClick={() => void save()}>
          Guardar mensaje
        </Button>
        {saved && <span className="text-sm font-medium text-brand-700">Guardado</span>}
      </div>
    </section>
  );
}

function TestMessageCard() {
  const sendTest = useSendTestMessage();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function send() {
    setError(null);
    setPreview(null);

    try {
      const result = await sendTest.mutateAsync({ phone });
      setPreview(result.body);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos enviar la prueba.');
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-bold text-ink-900">Probalo con tu número</h2>
        <p className="mt-0.5 text-sm text-ink-500">
          Mandate el mensaje a vos mismo antes de que lo reciba un paciente.
        </p>
      </div>

      {error && <ErrorNotice message={error} />}

      <div className="flex items-end gap-3">
        <TextField
          label="Tu WhatsApp"
          type="tel"
          inputMode="tel"
          placeholder="11 4444-5555"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="flex-1"
        />
        <Button
          variant="secondary"
          loading={sendTest.isPending}
          disabled={phone.trim().length < 6}
          onClick={() => void send()}
        >
          Enviar
        </Button>
      </div>

      {preview && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink-700">Así se ve el mensaje</p>
          <pre className="whitespace-pre-wrap rounded-2xl bg-brand-50 p-4 font-sans text-base text-ink-900">
            {preview}
          </pre>
        </div>
      )}
    </section>
  );
}

/**
 * The switch between "just me" and "a practice with several professionals".
 *
 * It lives here because this is the only settings surface in the product, and
 * it is a decision taken once. Both modes share the same data, so flipping it
 * only changes what the interface shows.
 */
function AccountModeCard() {
  const { user } = useAuth();
  const updateOrganization = useUpdateOrganization();
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const isClinic = user.organization.mode === 'CLINIC';

  async function switchTo(mode: 'SOLO' | 'CLINIC') {
    setError(null);
    try {
      await updateOrganization.mutateAsync({ mode });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos cambiar el modo.');
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-bold text-ink-900">Tu cuenta</h2>
        <p className="mt-0.5 text-sm text-ink-500">
          {isClinic
            ? 'Estás en modo consultorio: podés tener varias agendas, una por profesional.'
            : 'Estás en modo individual: una sola agenda, la tuya.'}
        </p>
      </div>

      {error && <ErrorNotice message={error} />}

      <Button
        variant="secondary"
        loading={updateOrganization.isPending}
        onClick={() => void switchTo(isClinic ? 'SOLO' : 'CLINIC')}
      >
        {isClinic ? 'Volver al modo individual' : 'Trabajo con más profesionales'}
      </Button>
    </section>
  );
}

function LogCard() {
  const log = useNotificationLog();

  if (log.isLoading) return <Loading label="Cargando mensajes…" />;

  if (!log.data || log.data.items.length === 0) {
    return (
      <InfoNotice>
        Todavía no se envió ningún recordatorio. Acá vas a ver cada mensaje, a quién fue y si llegó.
      </InfoNotice>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {log.data.items.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-ink-900">{entry.patientName}</p>
              <p className="truncate text-sm text-ink-500">
                {entry.toPhone} · turno del {formatFull(entry.appointmentStartsAt)}
              </p>
            </div>
            <NotificationBadge status={entry.status} />
          </div>

          {entry.error && <p className="text-sm text-danger-600">{entry.error}</p>}

          {entry.renderedBody && (
            <details className="text-sm text-ink-500">
              <summary className="cursor-pointer font-medium">Ver el mensaje</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-ground p-3 font-sans text-ink-700">
                {entry.renderedBody}
              </pre>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
