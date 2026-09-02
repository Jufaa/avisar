import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { PublicAppointmentDto } from '@avisar/shared';
import { api, ApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Loading } from '../../components/ui/Feedback';
import { capitalize, formatDayMonth, formatTime, formatWeekday } from '../../lib/format';

type Outcome = 'CONFIRMED' | 'CANCELLED';

/**
 * The one screen a patient ever sees.
 *
 * No account, no navigation, no explanation of what the app is. Two buttons
 * and a sentence. Anything else here is a reason for someone to not tap.
 */
export function ConfirmPage() {
  const { token = '' } = useParams();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const appointment = useQuery({
    queryKey: ['public-appointment', token],
    queryFn: () => api<PublicAppointmentDto>(`/public/appointments/${token}`, { anonymous: true }),
    retry: false,
  });

  const respond = useMutation({
    mutationFn: (action: 'CONFIRM' | 'CANCEL') =>
      api<{ ok: boolean; reason: string; status?: string }>(`/public/appointments/${token}`, {
        method: 'POST',
        body: { action },
        anonymous: true,
      }),
    onSuccess: (result, action) => {
      if (!result.ok) {
        setError('Este enlace ya no está disponible. Comunicate con el consultorio.');
        return;
      }
      setOutcome(action === 'CONFIRM' ? 'CONFIRMED' : 'CANCELLED');
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'No pudimos registrar tu respuesta.'),
  });

  if (appointment.isLoading) {
    return (
      <PatientLayout>
        <Loading />
      </PatientLayout>
    );
  }

  if (appointment.isError || !appointment.data?.appointment) {
    return (
      <PatientLayout>
        <Message
          icon="🔎"
          title="No encontramos este turno"
          description="El enlace puede haber vencido. Comunicate con el consultorio para confirmarlo."
        />
      </PatientLayout>
    );
  }

  const data = appointment.data.appointment;
  const when = new Date(data.startsAt);

  if (outcome) {
    return (
      <PatientLayout>
        <Message
          icon={outcome === 'CONFIRMED' ? '✅' : '👍'}
          title={outcome === 'CONFIRMED' ? '¡Listo, confirmado!' : 'Turno cancelado'}
          description={
            outcome === 'CONFIRMED'
              ? `Te esperamos el ${formatWeekday(when)} ${formatDayMonth(when)} a las ${formatTime(when)}.`
              : 'Avisamos al consultorio. Si querés reprogramar, comunicate con ellos.'
          }
        />
      </PatientLayout>
    );
  }

  if (appointment.data.expired) {
    return (
      <PatientLayout>
        <Message
          icon="⏰"
          title="Este enlace venció"
          description="Comunicate con el consultorio para confirmar tu turno."
        />
      </PatientLayout>
    );
  }

  if (data.status === 'CANCELLED') {
    return (
      <PatientLayout>
        <Message icon="🚫" title="Este turno está cancelado" description={data.organizationName} />
      </PatientLayout>
    );
  }

  return (
    <PatientLayout>
      <div className="flex flex-col gap-6 text-center">
        <div>
          <p className="text-base text-ink-500">{data.organizationName}</p>
          <h1 className="mt-2 text-2xl font-bold text-ink-900">Tu turno</h1>
        </div>

        <div className="rounded-2xl bg-brand-50 px-5 py-6">
          <p className="text-lg font-semibold text-brand-700">
            {capitalize(formatWeekday(when))} {formatDayMonth(when)}
          </p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-ink-900">{formatTime(when)}</p>
          <p className="mt-3 text-base text-ink-700">con {data.professionalName}</p>
        </div>

        {error && (
          <p role="alert" className="text-base font-medium text-danger-600">
            {error}
          </p>
        )}

        {data.status === 'CONFIRMED' ? (
          <Message icon="✅" title="Ya está confirmado" description="No hace falta que hagas nada más." />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-base font-medium text-ink-700">¿Vas a venir?</p>
            <div className="flex gap-3">
              <Button
                size="lg"
                fullWidth
                loading={respond.isPending}
                onClick={() => respond.mutate('CONFIRM')}
              >
                SÍ
              </Button>
              <Button
                variant="danger"
                size="lg"
                fullWidth
                loading={respond.isPending}
                onClick={() => respond.mutate('CANCEL')}
              >
                NO
              </Button>
            </div>
          </div>
        )}
      </div>
    </PatientLayout>
  );
}

function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}

function Message({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <span aria-hidden="true" className="text-5xl">
        {icon}
      </span>
      <h2 className="text-2xl font-bold text-ink-900">{title}</h2>
      <p className="text-base text-ink-500">{description}</p>
    </div>
  );
}
