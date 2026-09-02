/**
 * Contracts shared between the API and the web client.
 * Keep this package free of runtime dependencies: types and plain constants only.
 */

export const APPOINTMENT_STATUS = ['PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[number];

export const NOTIFICATION_STATUS = ['PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUS)[number];

export const TEMPLATE_KIND = ['REMINDER', 'CONFIRMATION'] as const;
export type TemplateKind = (typeof TEMPLATE_KIND)[number];

export const ACTION_KIND = ['CONFIRM', 'CANCEL'] as const;
export type ActionKind = (typeof ACTION_KIND)[number];

/**
 * SOLO hides the notion of "professional" from the interface entirely: the
 * account owner is the only one who attends. CLINIC surfaces it.
 * The data model is identical either way, so switching is a setting, not a
 * migration.
 */
export const ACCOUNT_MODE = ['SOLO', 'CLINIC'] as const;
export type AccountMode = (typeof ACCOUNT_MODE)[number];

/** Placeholders the user may type inside a message template. */
export const TEMPLATE_VARIABLES = [
  'nombre_paciente',
  'fecha',
  'hora',
  'profesional',
  'consultorio',
  'link',
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export interface OrganizationDto {
  id: string;
  name: string;
  timezone: string;
  plan: string;
  mode: AccountMode;
  maxUsers: number;
  onboardingCompletedAt: string | null;
}

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  organization: OrganizationDto;
}

export interface ProfessionalDto {
  id: string;
  fullName: string;
  specialty: string | null;
  defaultDurationMin: number;
  color: string;
  active: boolean;
  hasLogin: boolean;
}

export interface PatientDto {
  id: string;
  fullName: string;
  phoneE164: string;
  phoneDisplay: string;
  email: string | null;
  whatsappOptIn: boolean;
  notes: string | null;
  createdAt: string;
}

export interface AppointmentDto {
  id: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  status: AppointmentStatus;
  notes: string | null;
  patient: Pick<PatientDto, 'id' | 'fullName' | 'phoneE164' | 'phoneDisplay'>;
  professional: Pick<ProfessionalDto, 'id' | 'fullName' | 'color'>;
  reminders: AppointmentReminderDto[];
}

export interface AppointmentReminderDto {
  id: string;
  scheduledFor: string;
  status: NotificationStatus;
  sentAt: string | null;
  error: string | null;
}

export interface MessageTemplateDto {
  id: string;
  name: string;
  kind: TemplateKind;
  body: string;
}

export interface ReminderRuleDto {
  id: string;
  hoursBefore: number;
  enabled: boolean;
  professionalId: string | null;
  templateId: string;
}

export interface NotificationLogDto {
  id: string;
  scheduledFor: string;
  sentAt: string | null;
  status: NotificationStatus;
  attempts: number;
  error: string | null;
  renderedBody: string | null;
  toPhone: string;
  patientName: string;
  professionalName: string;
  appointmentStartsAt: string;
}

/** Payload returned by the public token endpoint the patient lands on. */
export interface PublicAppointmentDto {
  action: ActionKind;
  alreadyUsed: boolean;
  expired: boolean;
  appointment: {
    startsAt: string;
    status: AppointmentStatus;
    professionalName: string;
    organizationName: string;
    timezone: string;
  } | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
