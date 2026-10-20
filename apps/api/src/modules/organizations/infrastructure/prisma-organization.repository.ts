import type { Organization, PrismaClient } from '@prisma/client';
import type { OrganizationDto, UserDto } from '@avisar/shared';
import { env } from '../../../config/env.js';
import type { OrganizationRepository, OrganizationUpdate } from '../domain/organization.repository.js';

export function toOrganizationDto(organization: Organization): OrganizationDto {
  return {
    id: organization.id,
    name: organization.name,
    timezone: organization.timezone,
    plan: organization.plan,
    mode: organization.mode,
    maxUsers: organization.maxUsers,
    onboardingCompletedAt: organization.onboardingCompletedAt?.toISOString() ?? null,
  };
}

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAccount(userId: string): Promise<UserDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      organization: toOrganizationDto(user.organization),
      // Composed here rather than at each caller so the menu cannot disagree
      // with the routes: both consumers want the same view of what this
      // deployment has switched on.
      features: { invoicing: env.INVOICING_ENABLED },
    };
  }

  async update(organizationId: string, patch: OrganizationUpdate): Promise<OrganizationDto> {
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: patch,
    });
    return toOrganizationDto(updated);
  }

  async completeOnboarding(organizationId: string): Promise<OrganizationDto> {
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { onboardingCompletedAt: new Date() },
    });
    return toOrganizationDto(updated);
  }
}
