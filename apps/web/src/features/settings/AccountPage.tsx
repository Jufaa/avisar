import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useUpdateOrganization } from '../../lib/queries';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/Feedback';
import { ReminderRulesCard } from './ReminderRulesCard';

export function AccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header>
        <h1 className="text-3xl font-bold text-ink-900">Cuenta</h1>
        <p className="mt-0.5 text-base text-ink-500">La organización de tus agendas.</p>
      </header>

      <AccountModeCard />

      <ReminderRulesCard />
    </div>
  );
}

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
