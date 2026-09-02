import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import type { PatientRepository } from '../domain/patient.repository.js';

/**
 * A patient with appointment history is never deleted: those appointments are
 * the practice's own record, and a reminder already queued still needs a name
 * and a number to send to.
 */
export async function deletePatient(
  organizationId: string,
  patientId: string,
  repository: PatientRepository,
): Promise<void> {
  const patient = await repository.findById(organizationId, patientId);
  if (!patient) throw new NotFoundError('Patient');

  const appointments = await repository.countAppointments(organizationId, patientId);
  if (appointments > 0) {
    throw new ConflictError(
      `${patient.fullName} has ${appointments} appointment(s) on record and cannot be deleted.`,
      { appointments },
    );
  }

  await repository.delete(organizationId, patientId);
}
