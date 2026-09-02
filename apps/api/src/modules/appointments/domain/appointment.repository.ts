import type { AppointmentDto, AppointmentStatus } from '@avisar/shared';

export interface AppointmentRangeQuery {
  from: Date;
  to: Date;
  professionalId?: string;
}

export interface CreateAppointmentData {
  professionalId: string;
  patientId: string;
  startsAt: Date;
  durationMin: number;
  notes?: string | null;
}

export interface UpdateAppointmentData {
  professionalId?: string;
  patientId?: string;
  startsAt?: Date;
  durationMin?: number;
  notes?: string | null;
  status?: AppointmentStatus;
}

export interface OverlapQuery {
  professionalId: string;
  startsAt: Date;
  durationMin: number;
  excludeAppointmentId?: string;
}

export interface AppointmentRepository {
  listRange(organizationId: string, query: AppointmentRangeQuery): Promise<AppointmentDto[]>;
  findById(organizationId: string, id: string): Promise<AppointmentDto | null>;
  create(organizationId: string, data: CreateAppointmentData): Promise<AppointmentDto>;
  update(organizationId: string, id: string, data: UpdateAppointmentData): Promise<AppointmentDto>;
  cancel(organizationId: string, id: string, reason: string | null): Promise<AppointmentDto>;
  /** Returns an overlapping appointment for the same professional, if any. */
  findOverlap(organizationId: string, query: OverlapQuery): Promise<AppointmentDto | null>;
}
