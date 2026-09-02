import type { ProfessionalDto } from '@avisar/shared';

export interface ProfessionalInput {
  fullName: string;
  specialty?: string | null;
  defaultDurationMin?: number;
  color?: string;
  active?: boolean;
}

export interface ProfessionalRepository {
  list(organizationId: string, options: { includeInactive: boolean }): Promise<ProfessionalDto[]>;
  findById(organizationId: string, id: string): Promise<ProfessionalDto | null>;
  create(organizationId: string, input: ProfessionalInput): Promise<ProfessionalDto>;
  update(organizationId: string, id: string, input: Partial<ProfessionalInput>): Promise<ProfessionalDto>;
  /** Soft delete: an agenda with history is archived, never removed. */
  archive(organizationId: string, id: string): Promise<ProfessionalDto>;
  countUpcomingAppointments(organizationId: string, id: string): Promise<number>;
}
