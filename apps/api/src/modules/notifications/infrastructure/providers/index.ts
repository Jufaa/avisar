import { isIP } from 'node:net';
import { env } from '../../../../config/env.js';
import type { NotificationProvider } from '../../domain/notification-provider.js';
import { ConsoleNotificationProvider } from './console.provider.js';
import { FakeNotificationProvider } from './fake.provider.js';
import { TwilioNotificationProvider } from './twilio.provider.js';
import { MetaCloudNotificationProvider } from './meta-cloud.provider.js';

let instance: NotificationProvider | null = null;

const unavailableProvider: NotificationProvider = {
  name: 'unavailable',
  live: false,
  async send() {
    return { ok: false, error: 'The Avisar WhatsApp service is not configured', retryable: false };
  },
};

function publicConfirmationOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password
      && isIP(host) === 0 && host.includes('.')
      && !/(^|\.)(localhost|local|internal)$/.test(host);
  } catch {
    return false;
  }
}

/** Server-owned sender shared by all organizations; tenant credentials are unused. */
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
      if (![env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN, env.META_APP_SECRET,
        env.META_WEBHOOK_VERIFY_TOKEN, env.META_TEMPLATE_NAME].every((value) => value?.trim())
        || !publicConfirmationOrigin(env.WEB_APP_URL)) {
        instance = unavailableProvider;
        break;
      }
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
