import type { Patient, PrismaClient, Prisma } from '@prisma/client';
import type { PatientDto } from '@avisar/shared';
import { formatPhoneForDisplay } from '../../../shared/phone.js';
import type {
  PatientInput,
  PatientListQuery,
  PatientListResult,
  PatientRepository,
} from '../domain/patient.repository.js';

export function toPatientDto(patient: Patient): PatientDto {
  return {
    id: patient.id,
    fullName: patient.fullName,
    phoneE164: patient.phoneE164,
    phoneDisplay: formatPhoneForDisplay(patient.phoneE164),
    email: patient.email,
    whatsappOptIn: patient.whatsappOptIn,
    notes: patient.notes,
    createdAt: patient.createdAt.toISOString(),
  };
}

export class PrismaPatientRepository implements PatientRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organizationId: string, query: PatientListQuery): Promise<PatientListResult> {
    const search = query.search?.trim();
    // Users search by phone the way they read it, so strip everything but
    // digits before matching. An empty result here means the term was pure
    // text, and the phone clause must be left out entirely: `contains: ''`
    // matches every row and would silently turn a name search into a full
    // listing.
    const digits = search?.replace(/\D/g, '') ?? '';

    const where: Prisma.PatientWhereInput = {
      organizationId,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              ...(digits.length >= 3 ? [{ phoneE164: { contains: digits } }] : []),
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        orderBy: { fullName: 'asc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return { items: rows.map(toPatientDto), total };
  }

  async findById(organizationId: string, id: string): Promise<PatientDto | null> {
    const found = await this.prisma.patient.findFirst({ where: { id, organizationId } });
    return found ? toPatientDto(found) : null;
  }

  async findByPhone(organizationId: string, phoneE164: string): Promise<PatientDto | null> {
    const found = await this.prisma.patient.findUnique({
      where: { organizationId_phoneE164: { organizationId, phoneE164 } },
    });
    return found ? toPatientDto(found) : null;
  }

  async create(organizationId: string, input: PatientInput): Promise<PatientDto> {
    const created = await this.prisma.patient.create({
      data: {
        organizationId,
        fullName: input.fullName,
        phoneE164: input.phoneE164,
        email: input.email ?? null,
        notes: input.notes ?? null,
        ...(input.whatsappOptIn !== undefined ? { whatsappOptIn: input.whatsappOptIn } : {}),
      },
    });
    return toPatientDto(created);
  }

  async update(organizationId: string, id: string, input: Partial<PatientInput>): Promise<PatientDto> {
    const updated = await this.prisma.patient.update({
      where: { id, organizationId },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phoneE164 !== undefined ? { phoneE164: input.phoneE164 } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.whatsappOptIn !== undefined ? { whatsappOptIn: input.whatsappOptIn } : {}),
      },
    });
    return toPatientDto(updated);
  }

  async delete(organizationId: string, id: string): Promise<void> {
    await this.prisma.patient.delete({ where: { id, organizationId } });
  }

  async countAppointments(organizationId: string, id: string): Promise<number> {
    return this.prisma.appointment.count({ where: { organizationId, patientId: id } });
  }
}
