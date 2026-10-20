import type { OrganizationNotificationProviderResolver } from '../../domain/notification-provider.js';
import type { WhatsAppConnectionRepository } from '../../domain/whatsapp-connection.repository.js';
import { notificationProvider } from './index.js';

/** Compatibility adapter: organization credentials never select the central sender. */
export function organizationNotificationProvider(
  _repository: WhatsAppConnectionRepository,
): OrganizationNotificationProviderResolver {
  return async () => notificationProvider();
}
