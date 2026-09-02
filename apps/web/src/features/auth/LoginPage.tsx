import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { ErrorNotice } from '../../components/ui/Feedback';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await api<{ token: string }>('/auth/login', {
        method: 'POST',
        body: { email, password },
        anonymous: true,
      });

      await signIn(result.token);
      navigate('/agenda', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No pudimos ingresar. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Entrar" subtitle="Ingresá para ver la agenda de tu consultorio.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error && <ErrorNotice message={error} />}

        <TextField
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <TextField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <Button type="submit" size="lg" fullWidth loading={loading}>
          Entrar
        </Button>
      </form>

      <p className="mt-6 text-center text-base text-ink-500">
        ¿Todavía no tenés cuenta?{' '}
        <Link to="/crear-cuenta" className="font-semibold text-brand-700 underline">
          Creá una
        </Link>
      </p>
    </AuthLayout>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-2xl font-bold text-brand-700">Avisar</p>
          <h1 className="mt-6 text-3xl font-bold text-ink-900">{title}</h1>
          <p className="mt-2 text-base text-ink-500">{subtitle}</p>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
