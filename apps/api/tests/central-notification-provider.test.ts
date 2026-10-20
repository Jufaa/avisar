import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhatsAppConnectionRepository } from '../src/modules/notifications/domain/whatsapp-connection.repository.js';

const config = vi.hoisted(() => ({
  NOTIFICATION_PROVIDER: 'meta',
  META_PHONE_NUMBER_ID: 'central-number',
  META_ACCESS_TOKEN: 'test-central-token',
  META_APP_SECRET: 'test-app-secret',
  META_WEBHOOK_VERIFY_TOKEN: 'test-verify-token',
  META_TEMPLATE_NAME: 'recordatorio_turno',
  META_TEMPLATE_LANGUAGE: 'es_AR',
  META_TEMPLATE_PARAM_COUNT: 0,
  META_TEMPLATE_URL_BUTTON: false,
  META_API_VERSION: 'v21.0',
  WEB_APP_URL: 'https://avisar.example.com',
}));
vi.mock('../src/config/env.js', () => ({ env: config }));

const message = { to: '+5491144445555', body: 'Reminder', reference: 'notification-1' };

describe('central notification sender', () => {
  beforeEach(() => {
    vi.resetModules();
    config.NOTIFICATION_PROVIDER = 'meta';
    config.META_PHONE_NUMBER_ID = 'central-number';
    config.META_ACCESS_TOKEN = 'test-central-token';
    config.META_APP_SECRET = 'test-app-secret';
    config.META_WEBHOOK_VERIFY_TOKEN = 'test-verify-token';
    config.META_TEMPLATE_NAME = 'recordatorio_turno';
    config.WEB_APP_URL = 'https://avisar.example.com';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ messages: [{ id: 'wamid-central' }] }),
    })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses one server sender for different organizations without reading tenant credentials', async () => {
    const find = vi.fn(() => { throw new Error('Tenant credentials must not be read'); });
    const repository = { find } as unknown as WhatsAppConnectionRepository;
    const { organizationNotificationProvider } = await import('../src/modules/notifications/infrastructure/providers/organization-provider.js');
    const resolve = organizationNotificationProvider(repository);
    const first = await resolve('org-one');
    const second = await resolve('org-two');
    expect(first).toBe(second);
    expect(first).toMatchObject({ name: 'meta', live: true });
    await first.send(message);
    await second.send({ ...message, to: '+5491155556666', reference: 'notification-2' });
    expect(find).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url, request] of vi.mocked(fetch).mock.calls) {
      expect(url).toBe('https://graph.facebook.com/v21.0/central-number/messages');
      expect(request?.headers).toMatchObject({ Authorization: 'Bearer test-central-token' });
      expect(JSON.parse(request?.body as string)).toMatchObject({ type: 'template', template: { name: 'recordatorio_turno' } });
    }
  });

  it.each([
    'META_PHONE_NUMBER_ID', 'META_ACCESS_TOKEN', 'META_APP_SECRET',
    'META_WEBHOOK_VERIFY_TOKEN', 'META_TEMPLATE_NAME',
  ] as const)('fails without network when %s is missing', async (key) => {
    config[key] = '';
    const { notificationProvider } = await import('../src/modules/notifications/infrastructure/providers/index.js');
    const provider = notificationProvider();
    expect(provider).toMatchObject({ name: 'unavailable', live: false });
    expect(await provider.send(message)).toMatchObject({ ok: false, retryable: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['http://avisar.example.com', 'https://localhost', 'https://localhost.', 'https://app.localhost', 'https://127.0.0.1', 'https://[::1]', 'https://0.0.0.0'])('refuses unsafe confirmation origin %s', async (url) => {
    config.WEB_APP_URL = url;
    const { notificationProvider } = await import('../src/modules/notifications/infrastructure/providers/index.js');
    const provider = notificationProvider();
    expect(provider.name).toBe('unavailable');
    expect(await provider.send(message)).toMatchObject({ ok: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['fake', 'console'])('preserves explicit %s simulation without network', async (name) => {
    config.NOTIFICATION_PROVIDER = name;
    config.META_APP_SECRET = '';
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { notificationProvider } = await import('../src/modules/notifications/infrastructure/providers/index.js');
      const provider = notificationProvider();
      expect(provider).toMatchObject({ name, live: false });
      expect(await provider.send(message)).toMatchObject({ ok: true });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      output.mockRestore();
    }
  });
});
