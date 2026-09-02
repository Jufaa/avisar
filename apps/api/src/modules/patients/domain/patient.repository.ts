import type { PatientDto } from '@avisar/shared';

export interface PatientInput {
  fullName: string;
  phoneE164: string;
  email?: string | null;
  notes?: string | null;
  whatsappOptIn?: boolean;
}

export interface PatientListQuery {
  search?: string;
  limit: number;
  offset: number;
}

export interface PatientListResult {
  items: PatientDto[];
  total: number;
}

export interface PatientRepository {
  list(organizationId: string, query: PatientListQuery): Promise<PatientListResult>;
  findById(organizationId: string, id: string): Promise<PatientDto | null>;
  findByPhone(organizationId: string, phoneE164: string): Promise<PatientDto | null>;
  create(organizationId: string, input: PatientInput): Promise<PatientDto>;
  update(organizationId: string, id: string, input: Partial<PatientInput>): Promise<PatientDto>;
  delete(organizationId: string, id: string): Promise<void>;
  countAppointments(organizationId: string, id: string): Promise<number>;
}
