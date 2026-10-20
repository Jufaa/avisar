import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { Loading } from './components/ui/Feedback';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';
import { AgendaPage } from './features/agenda/AgendaPage';
import { PatientsPage } from './features/patients/PatientsPage';
import { ProfessionalsPage } from './features/professionals/ProfessionalsPage';
import { AccountPage } from './features/settings/AccountPage';
import { InvoicesPage } from './features/invoices/InvoicesPage';
import { InvoicePrintPage } from './features/invoices/InvoicePrintPage';
import { ConfirmPage } from './features/public/ConfirmPage';
import { useIsSolo } from './lib/useAccountMode';

export function App() {
  return (
    <Routes>
      {/* The patient's link — no session, no shell. */}
      <Route path="/t/:token" element={<ConfirmPage />} />

      <Route path="/ingresar" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/crear-cuenta" element={<GuestOnly><RegisterPage /></GuestOnly>} />

      <Route path="/primeros-pasos" element={<Private bare><OnboardingWizard /></Private>} />

      <Route path="/agenda" element={<Private><AgendaPage /></Private>} />
      <Route path="/pacientes" element={<Private><PatientsPage /></Private>} />
      <Route path="/profesionales" element={<Private><ClinicOnly><ProfessionalsPage /></ClinicOnly></Private>} />
      <Route path="/cuenta" element={<Private><AccountPage /></Private>} />
      <Route path="/recordatorios" element={<Navigate to="/cuenta" replace />} />
      <Route path="/facturas" element={<Private><InvoicingOnly><InvoicesPage /></InvoicingOnly></Private>} />
      {/* `bare`: the paper has no navigation rail on it. */}
      <Route path="/facturas/:id" element={<Private bare><InvoicingOnly><InvoicePrintPage /></InvoicingOnly></Private>} />

      <Route path="*" element={<Navigate to="/agenda" replace />} />
    </Routes>
  );
}

function Private({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/ingresar" replace />;

  // A brand-new account is sent through the wizard before anything else, so
  // the first thing it ever sees is a working appointment, not an empty grid.
  if (!bare && user.organization.onboardingCompletedAt === null) {
    return <Navigate to="/primeros-pasos" replace />;
  }

  return bare ? <>{children}</> : <AppShell>{children}</AppShell>;
}

/** A solo account has no professionals screen, so the URL leads nowhere. */
function ClinicOnly({ children }: { children: React.ReactNode }) {
  const isSolo = useIsSolo();
  if (isSolo) return <Navigate to="/agenda" replace />;
  return <>{children}</>;
}

function InvoicingOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  // Keep the destination discoverable without mounting queries against an
  // invoicing API that is not enabled in this deployment.
  if (!user?.features.invoicing) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <h1 className="text-3xl font-bold text-ink-900">Facturas</h1>
        <h2 className="text-lg font-semibold text-ink-900">Facturación pendiente de activación</h2>
        <p className="text-base text-ink-500">
          La facturación aún no está habilitada en esta aplicación. Contacta al administrador
          para activar el servicio y configurar el CUIT que emitirá los comprobantes.
        </p>
      </section>
    );
  }
  return <>{children}</>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;
  if (user) return <Navigate to="/agenda" replace />;

  return <>{children}</>;
}
