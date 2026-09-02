import { Prisma, type PrismaClient } from '@prisma/client';
import type { AppointmentDto } from '@avisar/shared';
import { formatPhoneForDisplay } from '../../../shared/phone.js';
import { addMinutes } from '../../../shared/datetime.js';
import type {
  AppointmentRangeQuery,
  AppointmentRepository,
  CreateAppointmentData,
  OverlapQuery,
  UpdateAppointmentData,
} from '../domain/appointment.repository.js';

const APPOINTMENT_INCLUDE = {
  patient: true,
  professional: true,
  notifications: {
    orderBy: { scheduledFor: 'asc' },
  },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

export function toAppointmentDto(row: AppointmentRow): AppointmentDto {
  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: addMinutes(row.startsAt, row.durationMin).toISOString(),
    durationMin: row.durationMin,
    status: row.status,
    notes: row.notes,
    patient: {
      id: row.patient.id,
      fullName: row.patient.fullName,
      phoneE164: row.patient.phoneE164,
      phoneDisplay: formatPhoneForDisplay(row.patient.phoneE164),
    },
    professional: {
      id: row.professional.id,
      fullName: row.professional.fullName,
      color: row.professional.color,
    },
    reminders: row.notifications.map((notification) => ({
      id: notification.id,
      scheduledFor: notification.scheduledFor.toISOString(),
      status: notification.status,
      sentAt: notification.sentAt?.toISOString() ?? null,
      error: notification.error,
    })),
  };
}

export class PrismaAppointmentRepository implements AppointmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listRange(organizationId: string, query: AppointmentRangeQuery): Promise<AppointmentDto[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        organizationId,
        startsAt: { gte: query.from, lt: query.to },
        ...(query.professionalId ? { professionalId: query.professionalId } : {}),
      },
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: 'asc' },
    });
    return rows.map(toAppointmentDto);
  }

  async findById(organizationId: string, id: string): Promise<AppointmentDto | null> {
    const row = await this.prisma.appointment.findFirst({
      where: { id, organizationId },
      include: APPOINTMENT_INCLUDE,
    });
    return row ? toAppointmentDto(row) : null;
  }

  async create(organizationId: string, data: CreateAppointmentData): Promise<AppointmentDto> {
    const row = await this.prisma.appointment.create({
      data: {
        organizationId,
        professionalId: data.professionalId,
        patientId: data.patientId,
        startsAt: data.startsAt,
        durationMin: data.durationMin,
        notes: data.notes ?? null,
      },
      include: APPOINTMENT_INCLUDE,
    });
    return toAppointmentDto(row);
  }

  async update(organizationId: string, id: string, data: UpdateAppointmentData): Promise<AppointmentDto> {
    const row = await this.prisma.appointment.update({
      where: { id, organizationId },
      data: {
        ...(data.professionalId !== undefined ? { professionalId: data.professionalId } : {}),
        ...(data.patientId !== undefined ? { patientId: data.patientId } : {}),
        ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
        ...(data.durationMin !== undefined ? { durationMin: data.durationMin } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.status !== undefined
          ? {
              status: data.status,
              confirmedAt: data.status === 'CONFIRMED' ? new Date() : null,
            }
          : {}),
      },
      include: APPOINTMENT_INCLUDE,
    });
    return toAppointmentDto(row);
  }

  async cancel(organizationId: string, id: string, reason: string | null): Promise<AppointmentDto> {
    const row = await this.prisma.appointment.update({
      where: { id, organizationId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
      include: APPOINTMENT_INCLUDE,
    });
    return toAppointmentDto(row);
  }

  /**
   * Two appointments overlap when one starts before the other ends.
   * Postgres has no interval column here, so the comparison is expressed on
   * `starts_at` plus the stored duration.
   */
  async findOverlap(organizationId: string, query: OverlapQuery): Promise<AppointmentDto | null> {
    const newEnd = addMinutes(query.startsAt, query.durationMin);

    const candidates = await this.prisma.appointment.findMany({
      where: {
        organizationId,
        professionalId: query.professionalId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        ...(query.excludeAppointmentId ? { id: { not: query.excludeAppointmentId } } : {}),
        // Widest possible window: nothing longer than 8 hours can overlap.
        startsAt: {
          gt: new Date(query.startsAt.getTime() - 8 * 3_600_000),
          lt: newEnd,
        },
      },
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: 'asc' },
    });

    const clash = candidates.find(
      (candidate) => addMinutes(candidate.startsAt, candidate.durationMin) > query.startsAt,
    );

    return clash ? toAppointmentDto(clash) : null;
  }
}
