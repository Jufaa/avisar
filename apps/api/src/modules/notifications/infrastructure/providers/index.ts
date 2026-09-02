import { env } from '../../../../config/env.js';
import type { NotificationProvider } from '../../domain/notification-provider.js';
import { ConsoleNotificationProvider } from './console.provider.js';
import { FakeNotificationProvider } from './fake.provider.js';
import { TwilioNotificationProvider } from './twilio.provider.js';
import { MetaCloudNotificationProvider } from './meta-cloud.provider.js';

let instance: NotificationProvider | null = null;

/**
 * The single place the concrete provider is chosen. Switching the product
 * from a printed message to real WhatsApp is one environment variable, and
 * nothing above this file changes.
 */
export function notificationProvider(): NotificationProvider {
  if (instance) return instance;

  switch (env.NOTIFICATION_PROVIDER) {
    case 'twilio':
      // env validation already guaranteed these three are present.
      instance = new TwilioNotificationProvider({
        accountSid: env.TWILIO_ACCOUNT_SID!,
        authToken: env.TWILIO_AUTH_TOKEN!,
        from: env.TWILIO_WHATSAPP_FROM!,
        contentSid: env.TWILIO_CONTENT_SID,
      });
      break;
    case 'meta':
      instance = new MetaCloudNotificationProvider({
        phoneNumberId: env.META_PHONE_NUMBER_ID!,
        accessToken: env.META_ACCESS_TOKEN!,
        templateName: env.META_TEMPLATE_NAME,
        templateLanguage: env.META_TEMPLATE_LANGUAGE,
        templateParamCount: env.META_TEMPLATE_PARAM_COUNT,
        templateHasUrlButton: env.META_TEMPLATE_URL_BUTTON,
        apiVersion: env.META_API_VERSION,
      });
      break;
    case 'fake':
      instance = new FakeNotificationProvider();
      break;
    default:
      instance = new ConsoleNotificationProvider();
  }

  return instance;
}

export {
  ConsoleNotificationProvider,
  FakeNotificationProvider,
  MetaCloudNotificationProvider,
  TwilioNotificationProvider,
};
