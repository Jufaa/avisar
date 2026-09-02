import type { PatientDto } from '@avisar/shared';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { normalizePhone } from '../../../shared/phone.js';
import type { PatientRepository } from '../domain/patient.repository.js';

export interface UpdatePatientInput {
  fullName?: string;
  phone?: string;
  email?: string | null;
  notes?: string | null;
  whatsappOptIn?: boolean;
}

export async function updatePatient(
  organizationId: string,
  patientId: string,
  input: UpdatePatientInput,
  repository: PatientRepository,
): Promise<PatientDto> {
  const current = await repository.findById(organizationId, patientId);
  if (!current) throw new NotFoundError('Patient');

  let phoneE164: string | undefined;
  if (input.phone !== undefined) {
    phoneE164 = normalizePhone(input.phone);

    if (phoneE164 !== current.phoneE164) {
      const owner = await repository.findByPhone(organizationId, phoneE164);
      if (owner && owner.id !== patientId) {
        throw new ConflictError(`${owner.fullName} already uses that number`, { patientId: owner.id });
      }
    }
  }

  return repository.update(organizationId, patientId, {
    ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
    ...(phoneE164 !== undefined ? { phoneE164 } : {}),
    ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    ...(input.whatsappOptIn !== undefined ? { whatsappOptIn: input.whatsappOptIn } : {}),
  });
}
