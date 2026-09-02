import type { Professional, PrismaClient } from '@prisma/client';
import type { ProfessionalDto } from '@avisar/shared';
import type { ProfessionalInput, ProfessionalRepository } from '../domain/professional.repository.js';

export function toProfessionalDto(professional: Professional): ProfessionalDto {
  return {
    id: professional.id,
    fullName: professional.fullName,
    specialty: professional.specialty,
    defaultDurationMin: professional.defaultDurationMin,
    color: professional.color,
    active: professional.active,
    hasLogin: professional.userId !== null,
  };
}

export class PrismaProfessionalRepository implements ProfessionalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organizationId: string, options: { includeInactive: boolean }): Promise<ProfessionalDto[]> {
    const rows = await this.prisma.professional.findMany({
      where: {
        organizationId,
        ...(options.includeInactive ? {} : { active: true }),
      },
      orderBy: { fullName: 'asc' },
    });
    return rows.map(toProfessionalDto);
  }

  async findById(organizationId: string, id: string): Promise<ProfessionalDto | null> {
    const found = await this.prisma.professional.findFirst({ where: { id, organizationId } });
    return found ? toProfessionalDto(found) : null;
  }

  async create(organizationId: string, input: ProfessionalInput): Promise<ProfessionalDto> {
    const created = await this.prisma.professional.create({
      data: {
        organizationId,
        fullName: input.fullName,
        specialty: input.specialty ?? null,
        defaultDurationMin: input.defaultDurationMin ?? 30,
        ...(input.color ? { color: input.color } : {}),
      },
    });
    return toProfessionalDto(created);
  }

  async update(organizationId: string, id: string, input: Partial<ProfessionalInput>): Promise<ProfessionalDto> {
    const updated = await this.prisma.professional.update({
      // The organization id in the filter is what keeps one tenant from
      // touching another tenant's row by guessing an id.
      where: { id, organizationId },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.specialty !== undefined ? { specialty: input.specialty } : {}),
        ...(input.defaultDurationMin !== undefined ? { defaultDurationMin: input.defaultDurationMin } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    return toProfessionalDto(updated);
  }

  async archive(organizationId: string, id: string): Promise<ProfessionalDto> {
    const updated = await this.prisma.professional.update({
      where: { id, organizationId },
      data: { active: false },
    });
    return toProfessionalDto(updated);
  }

  async countUpcomingAppointments(organizationId: string, id: string): Promise<number> {
    return this.prisma.appointment.count({
      where: {
        organizationId,
        professionalId: id,
        startsAt: { gte: new Date() },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });
  }
}
