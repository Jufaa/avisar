import { useState, type FormEvent } from 'react';
import type { ReminderRuleDto } from '@avisar/shared';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { ApiError } from '../../lib/api';
import { useReminderRules, useSaveReminderRule, useTemplates } from '../../lib/queries';

type TimeUnit = 'hours' | 'days';

function leadTime(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? 'día' : 'días'} antes`;
  }
  return `${hours} ${hours === 1 ? 'hora' : 'horas'} antes`;
}

export function ReminderRulesCard() {
  const rules = useReminderRules();
  const templates = useTemplates();
  const saveRule = useSaveReminderRule();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState<TimeUnit>('days');
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const accountRules = (rules.data ?? []).filter((rule) => rule.professionalId === null);
  const activeRules = accountRules.filter((rule) => rule.enabled)
    .sort((a, b) => b.hoursBefore - a.hoursBefore);
  const reminderTemplate = templates.data?.find((template) => template.kind === 'REMINDER');
  const loading = rules.isPending || templates.isPending;
  const loadFailed = rules.isError || templates.isError;
  const busy = action !== null;

  function resetForm() {
    setEditingId(null);
    setAmount('1');
    setUnit('days');
  }

  function edit(rule: ReminderRuleDto) {
    setEditingId(rule.id);
    setUnit(rule.hoursBefore % 24 === 0 ? 'days' : 'hours');
    setAmount(String(rule.hoursBefore % 24 === 0 ? rule.hoursBefore / 24 : rule.hoursBefore));
    setError(null);
    setNotice(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    const value = Number(amount);
    const hoursBefore = value * (unit === 'days' ? 24 : 1);

    if (!Number.isInteger(value) || hoursBefore < 1 || hoursBefore > 336) {
      setError('Indica una cantidad entera entre 1 y 336 horas, o entre 1 y 14 días.');
      return;
    }
    if (activeRules.some((rule) => rule.id !== editingId && rule.hoursBefore === hoursBefore)) {
      setError('Ya hay un recordatorio con esa anticipación.');
      return;
    }

    setAction('save');
    try {
      if (editingId) {
        await saveRule.mutateAsync({ id: editingId, hoursBefore });
      } else {
        // Keep existing notification links and history when reusing a paused rule.
        const paused = accountRules.find((rule) => !rule.enabled && rule.hoursBefore === hoursBefore);
        if (paused) {
          await saveRule.mutateAsync({ id: paused.id, enabled: true });
        } else if (reminderTemplate) {
          await saveRule.mutateAsync({ hoursBefore, templateId: reminderTemplate.id });
        } else {
          setError('No se pudo cargar la configuración de recordatorios. Intenta nuevamente.');
          return;
        }
      }
      await rules.refetch();
      resetForm();
      setNotice('Recordatorio guardado para los turnos nuevos.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo guardar el recordatorio.');
    } finally {
      setAction(null);
    }
  }

  async function remove(rule: ReminderRuleDto) {
    if (busy) return;
    setError(null);
    setNotice(null);
    setAction(rule.id);
    try {
      // Hard deletion would also delete already scheduled messages and delivery history.
      await saveRule.mutateAsync({ id: rule.id, enabled: false });
      await rules.refetch();
      if (editingId === rule.id) resetForm();
      setNotice('Recordatorio quitado para los turnos nuevos.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo quitar el recordatorio.');
    } finally {
      setAction(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-bold text-ink-900">Recordatorios</h2>
        <p className="mt-1 text-sm text-ink-500">
          Elige cuántos avisos enviar y con cuánta anticipación. Estos horarios se aplican a todas
          las agendas de la cuenta.
        </p>
      </div>

      <p className="rounded-xl bg-brand-50 p-3 text-sm text-ink-700">
        Los cambios se aplican solo a los turnos nuevos. Los recordatorios de turnos ya agendados
        se conservan, incluso al quitar un horario de esta lista.
      </p>

      {loading ? (
        <p role="status" className="text-sm text-ink-500">Cargando recordatorios…</p>
      ) : loadFailed ? (
        <div className="flex flex-col gap-3">
          <ErrorNotice message="No se pudieron cargar los recordatorios." />
          <Button variant="secondary" onClick={() => {
            void rules.refetch();
            void templates.refetch();
          }}>Reintentar</Button>
        </div>
      ) : (
        <>
          <p className="font-semibold text-ink-900">
            {activeRules.length === 1 ? '1 aviso por turno nuevo' : `${activeRules.length} avisos por turno nuevo`}
          </p>

          {activeRules.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {activeRules.map((rule) => (
                <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
                  <span className="font-medium text-ink-900">{leadTime(rule.hoursBefore)}</span>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" disabled={busy}
                      aria-label={`Cambiar recordatorio de ${leadTime(rule.hoursBefore)}`}
                      onClick={() => edit(rule)}>Cambiar</Button>
                    <Button type="button" variant="ghost" disabled={busy} loading={action === rule.id}
                      aria-label={`Quitar recordatorio de ${leadTime(rule.hoursBefore)}`}
                      onClick={() => void remove(rule)}>Quitar</Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">Los turnos nuevos no tendrán recordatorios hasta que agregues uno.</p>
          )}

          <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3 border-t border-line pt-4">
            <h3 className="font-semibold text-ink-900">
              {editingId ? 'Cambiar recordatorio' : 'Agregar recordatorio'}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label="Anticipación" type="number" inputMode="numeric" required min={1}
                max={unit === 'days' ? 14 : 336} step={1} value={amount} disabled={busy}
                onChange={(event) => setAmount(event.target.value)} />
              <SelectField label="Unidad" value={unit} disabled={busy}
                onChange={(event) => setUnit(event.target.value as TimeUnit)}>
                <option value="hours">Horas antes</option>
                <option value="days">Días antes</option>
              </SelectField>
            </div>
            <p className="text-sm text-ink-500">Desde 1 hora hasta 14 días antes del turno.</p>
            {error && <ErrorNotice message={error} />}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={action === 'save'} disabled={busy}>
                {editingId ? 'Guardar cambio' : 'Agregar recordatorio'}
              </Button>
              {editingId && (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => {
                  resetForm();
                  setError(null);
                }}>Cancelar edición</Button>
              )}
            </div>
          </form>
          {notice && <p role="status" className="text-sm text-brand-700">{notice}</p>}
          <p className="text-sm text-ink-500">
            Si al crear el turno ya pasó la hora de alguno de sus avisos, ese aviso no se envía.
            Los pacientes deben tener habilitada la recepción de recordatorios.
          </p>
        </>
      )}
      <p className="text-sm text-ink-500">
        Avisar envía los mensajes desde su número central. El paciente confirma o cancela desde
        el enlace del mensaje y su respuesta aparece en la agenda.
      </p>
    </section>
  );
}
