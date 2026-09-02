import type { ProfessionalDto } from '@avisar/shared';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import type { ProfessionalRepository } from '../domain/professional.repository.js';

/**
 * Archiving is a soft delete on purpose: past appointments must keep pointing
 * at a real professional, and a reminder already queued must still know whose
 * name to print.
 *
 * Upcoming appointments block the archive. Silently orphaning them would send
 * patients to a professional the practice believes is gone.
 */
export async function archiveProfessional(
  organizationId: string,
  professionalId: string,
  repository: ProfessionalRepository,
): Promise<ProfessionalDto> {
  const professional = await repository.findById(organizationId, professionalId);
  if (!professional) throw new NotFoundError('Professional');

  const upcoming = await repository.countUpcomingAppointments(organizationId, professionalId);
  if (upcoming > 0) {
    throw new ConflictError(
      `${professional.fullName} still has ${upcoming} upcoming appointment(s). Cancel or reassign them first.`,
      { upcoming },
    );
  }

  return repository.archive(organizationId, professionalId);
}
