import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useIsSolo } from '../lib/useAccountMode';

const NAV = [
  { to: '/agenda', label: 'Agenda', icon: '🗓️' },
  { to: '/pacientes', label: 'Pacientes', icon: '👤' },
  { to: '/profesionales', label: 'Profesionales', icon: '🩺', clinicOnly: true },
  { to: '/recordatorios', label: 'Recordatorios', icon: '💬' },
];

/**
 * Bottom tab bar on a phone, side rail on a desktop.
 *
 * Four destinations, never more: a practice manager should be able to reach
 * anything in the product without reading a menu.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const isSolo = useIsSolo();

  const nav = NAV.filter((item) => !(item.clinicOnly && isSolo));

  return (
    <div className="min-h-dvh sm:flex">
      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface sm:flex">
        <div className="px-5 py-6">
          <p className="text-lg font-bold text-brand-700">Avisar</p>
          <p className="mt-0.5 truncate text-sm text-ink-500">{user?.organization.name}</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium transition-colors',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-line-soft',
                ].join(' ')
              }
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line-soft p-3">
          <p className="truncate px-3 py-1 text-sm text-ink-500">{user?.fullName}</p>
          <button
            type="button"
            onClick={signOut}
            className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-500 hover:bg-line-soft"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 sm:hidden">
          <div className="min-w-0">
            <p className="text-base font-bold text-brand-700">Avisar</p>
            <p className="truncate text-xs text-ink-500">{user?.organization.name}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg px-3 py-2 text-sm font-medium text-ink-500"
          >
            Salir
          </button>
        </header>

        {/* pb-24 leaves room for the mobile tab bar */}
        <main className="flex-1 px-4 pb-24 pt-4 sm:px-8 sm:pb-10 sm:pt-8">{children}</main>

        {/* Mobile tab bar */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
          style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
        >
          {nav.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={[
                  'flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium',
                  active ? 'text-brand-700' : 'text-ink-500',
                ].join(' ')}
              >
                <span aria-hidden="true" className="text-lg">
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
