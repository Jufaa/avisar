import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { ErrorNotice } from '../../components/ui/Feedback';
import { AuthLayout } from './LoginPage';

export function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    organizationName: '',
    fullName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await api<{ token: string }>('/auth/register', {
        method: 'POST',
        // The timezone comes from the browser, so nobody has to know what an
        // IANA identifier is during sign-up.
        body: { ...form, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        anonymous: true,
      });

      await signIn(result.token);
      navigate('/primeros-pasos', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'No pudimos crear la cuenta. Probá de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Crear cuenta" subtitle="Cuatro datos y ya podés cargar tu primer turno.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error && <ErrorNotice message={error} />}

        <TextField
          label="Tu nombre"
          hint="Así te van a ver tus pacientes en el recordatorio."
          required
          value={form.fullName}
          onChange={update('fullName')}
        />

        <TextField
          label="Nombre de tu consultorio"
          hint="Si trabajás solo, puede ser tu propio nombre."
          required
          value={form.organizationName}
          onChange={update('organizationName')}
        />

        <TextField
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={form.email}
          onChange={update('email')}
        />

        <TextField
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          hint="Al menos 8 caracteres."
          minLength={8}
          required
          value={form.password}
          onChange={update('password')}
        />

        <Button type="submit" size="lg" fullWidth loading={loading}>
          Crear cuenta
        </Button>
      </form>

      <p className="mt-6 text-center text-base text-ink-500">
        ¿Ya tenés cuenta?{' '}
        <Link to="/ingresar" className="font-semibold text-brand-700 underline">
          Entrá
        </Link>
      </p>
    </AuthLayout>
  );
}
