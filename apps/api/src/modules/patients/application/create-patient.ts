import type { PatientDto } from '@avisar/shared';
import { ConflictError } from '../../../shared/errors.js';
import { normalizePhone } from '../../../shared/phone.js';
import type { PatientInput, PatientRepository } from '../domain/patient.repository.js';

export interface CreatePatientInput extends Omit<PatientInput, 'phoneE164'> {
  phone: string;
}

/**
 * The phone number is normalized here, before anything else touches it.
 * Every downstream consumer — the unique constraint, the WhatsApp provider,
 * the search — can then assume a single canonical shape.
 */
export async function createPatient(
  organizationId: string,
  input: CreatePatientInput,
  repository: PatientRepository,
): Promise<PatientDto> {
  const phoneE164 = normalizePhone(input.phone);

  const existing = await repository.findByPhone(organizationId, phoneE164);
  if (existing) {
    throw new ConflictError(`${existing.fullName} is already registered with that number`, {
      patientId: existing.id,
    });
  }

  return repository.create(organizationId, {
    fullName: input.fullName.trim(),
    phoneE164,
    email: input.email?.trim() || null,
    notes: input.notes?.trim() || null,
    whatsappOptIn: input.whatsappOptIn,
  });
}
