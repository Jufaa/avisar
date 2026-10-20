import type { ReactNode } from 'react';
import type {
  AppointmentStatus,
  DeliveryStatus,
  InvoiceStatus,
  NotificationStatus,
} from '@avisar/shared';
import { formatTime } from '../../lib/format';

// --- status pills ----------------------------------------------------------

const APPOINTMENT_LABELS: Record<AppointmentStatus, { label: string; className: string }> = {
  PENDING: { label: 'Sin confirmar', className: 'bg-warn-50 text-warn-600' },
  CONFIRMED: { label: 'Confirmado', className: 'bg-brand-100 text-brand-700' },
  CANCELLED: { label: 'Cancelado', className: 'bg-danger-50 text-danger-600' },
  NO_SHOW: { label: 'No asistió', className: 'bg-line-soft text-ink-500' },
};

export function AppointmentBadge({ status }: { status: AppointmentStatus }) {
  const { label, className } = APPOINTMENT_LABELS[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

const NOTIFICATION_LABELS: Record<NotificationStatus, { label: string; className: string }> = {
  PENDING: { label: 'En cola', className: 'bg-info-50 text-info-600' },
  SENDING: { label: 'Enviando', className: 'bg-info-50 text-info-600' },
  SENT: { label: 'Enviado', className: 'bg-brand-100 text-brand-700' },
  FAILED: { label: 'Falló', className: 'bg-danger-50 text-danger-600' },
  CANCELLED: { label: 'No se envió', className: 'bg-line-soft text-ink-500' },
};

export function NotificationBadge({ status }: { status: NotificationStatus }) {
  const { label, className } = NOTIFICATION_LABELS[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

const DELIVERY_LABELS: Record<DeliveryStatus, { label: string; className: string }> = {
  DELIVERED: { label: 'Entregado', className: 'bg-brand-100 text-brand-700' },
  READ: { label: 'Leído', className: 'bg-brand-100 text-brand-700' },
  UNDELIVERED: { label: 'No llegó', className: 'bg-danger-50 text-danger-600' },
  // "Enviado" on its own reads as success. It is not one: it only means the
  // provider took the request, and saying so plainly is the honest version.
  UNKNOWN: { label: 'Enviado, sin confirmar', className: 'bg-info-50 text-info-600' },
};

/**
 * What the provider reported back about a message we already handed over.
 *
 * Takes over from the send badge once a row is SENT, because delivery is the
 * stricter and more useful claim. A reminder that never reached the phone is
 * not a sent reminder.
 */
export function DeliveryBadge({
  deliveryStatus,
  deliveredAt,
}: {
  deliveryStatus: DeliveryStatus;
  deliveredAt: string | null;
}) {
  const { label, className } = DELIVERY_LABELS[deliveryStatus];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {label}
      {deliveredAt && deliveryStatus !== 'UNDELIVERED' && (
        <span className="font-normal opacity-70">{formatTime(deliveredAt)}</span>
      )}
    </span>
  );
}

// --- page-level states -----------------------------------------------------

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-500">
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-ink-300 border-t-brand-500"
      />
      <span className="text-base">{label}</span>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
      <h3 className="text-lg font-bold text-ink-900">{title}</h3>
      <p className="max-w-sm text-base text-ink-500">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger-600/30 bg-danger-50 px-4 py-3 text-base font-medium text-danger-600"
    >
      {message}
    </div>
  );
}

export function InfoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-info-600/20 bg-info-50 px-4 py-3 text-sm text-info-600">
      {children}
    </div>
  );
}

const INVOICE_LABELS: Record<InvoiceStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Borrador', className: 'bg-line-soft text-ink-700' },
  ISSUING: { label: 'Emitiendo', className: 'bg-info-50 text-info-600' },
  ISSUED: { label: 'Emitida', className: 'bg-brand-100 text-brand-700' },
  FAILED: { label: 'Rechazada', className: 'bg-danger-50 text-danger-600' },
  VOID: { label: 'Anulada', className: 'bg-line-soft text-ink-500' },
};

export function InvoiceBadge({ status }: { status: InvoiceStatus }) {
  const { label, className } = INVOICE_LABELS[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}
