import type { AccountMode, OrganizationDto, UserDto } from '@avisar/shared';

export interface OrganizationUpdate {
  name?: string;
  timezone?: string;
  mode?: AccountMode;
}

export interface OrganizationRepository {
  findAccount(userId: string): Promise<UserDto | null>;
  update(organizationId: string, patch: OrganizationUpdate): Promise<OrganizationDto>;
  completeOnboarding(organizationId: string): Promise<OrganizationDto>;
}
