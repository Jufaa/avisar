import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetaCloudNotificationProvider } from '../src/modules/notifications/infrastructure/providers/meta-cloud.provider.js';
import type { OutboundMessage } from '../src/modules/notifications/domain/notification-provider.js';

const BASE = {
  phoneNumberId: '123456789',
  accessToken: 'token-abc',
  templateLanguage: 'es_AR',
  templateParamCount: 5,
  templateHasUrlButton: false,
  apiVersion: 'v21.0',
};

const message: OutboundMessage = {
  to: '+5493584181872',
  body: 'Hola María! Te esperamos el viernes a las 14:30.',
  variables: { '1': 'María', '2': 'Ana Gómez', '3': 'viernes 28', '4': '14:30', '5': 'https://x.test/t/abc' },
  buttonParameter: 'abc123',
  reference: 'notification-1',
};

/** Captures the request instead of performing it. */
function stubFetch(status: number, payload: unknown) {
  const spy = vi.fn(async () =>
    new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function bodyOf(spy: ReturnType<typeof stubFetch>): Record<string, any> {
  const init = spy.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(init.body as string);
}

afterEach(() => vi.unstubAllGlobals());

describe('MetaCloudNotificationProvider', () => {
  it('sends a template with the values in the agreed order', async () => {
    const spy = stubFetch(200, { messages: [{ id: 'wamid.HBg=' }] });

    const provider = new MetaCloudNotificationProvider({ ...BASE, templateName: 'recordatorio_turno' });
    const result = await provider.send(message);

    expect(result).toEqual({ ok: true, providerMessageId: 'wamid.HBg=' });

    const sent = bodyOf(spy);
    expect(sent.type).toBe('template');
    expect(sent.template.name).toBe('recordatorio_turno');
    expect(sent.template.language).toEqual({ code: 'es_AR' });
    expect(sent.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([
      'María',
      'Ana Gómez',
      'viernes 28',
      '14:30',
      'https://x.test/t/abc',
    ]);
  });

  it('sends the destination in the exact shape Meta registered', async () => {
    const spy = stubFetch(200, { messages: [{ id: 'wamid.1' }] });

    await new MetaCloudNotificationProvider({ ...BASE, templateName: 't' }).send(message);

    expect(bodyOf(spy).to).toBe('543584181872');
  });

  it('omits components for a template with no parameters, like hello_world', async () => {
    const spy = stubFetch(200, { messages: [{ id: 'wamid.2' }] });

    await new MetaCloudNotificationProvider({
      ...BASE,
      templateName: 'hello_world',
      templateLanguage: 'en_US',
      templateParamCount: 0,
    }).send(message);

    // Meta rejects an empty components array as a parameter mismatch.
    expect(bodyOf(spy).template.components).toBeUndefined();
  });

  it('falls back to free text when no template is configured', async () => {
    const spy = stubFetch(200, { messages: [{ id: 'wamid.3' }] });

    await new MetaCloudNotificationProvider(BASE).send(message);

    const sent = bodyOf(spy);
    expect(sent.type).toBe('text');
    expect(sent.text.body).toBe(message.body);
  });

  it('does not retry a missing template: it would fail the same way forever', async () => {
    stubFetch(400, { error: { code: 132001, message: 'Template name does not exist' } });

    const result = await new MetaCloudNotificationProvider({ ...BASE, templateName: 'nope' }).send(message);

    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(result.ok === false && result.error).toContain('META_TEMPLATE_NAME');
  });

  it('retries a rate limit', async () => {
    stubFetch(429, { error: { code: 130429, message: 'Rate limit hit' } });

    const result = await new MetaCloudNotificationProvider({ ...BASE, templateName: 't' }).send(message);

    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it('treats a 200 without a message id as a failure, not a delivery', async () => {
    stubFetch(200, { messages: [] });

    const result = await new MetaCloudNotificationProvider({ ...BASE, templateName: 't' }).send(message);

    // Marking this SENT would lose the reminder silently and forever.
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it('survives a network failure and asks to be retried', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    const result = await new MetaCloudNotificationProvider({ ...BASE, templateName: 't' }).send(message);

    expect(result).toMatchObject({ ok: false, retryable: true });
  });
});

describe('dynamic URL button', () => {
  it('sends the token as the button suffix, not the whole URL', async () => {
    const spy = stubFetch(200, { messages: [{ id: 'wamid.4' }] });

    await new MetaCloudNotificationProvider({
      ...BASE,
      templateName: 'recordatorio_turno',
      templateParamCount: 4,
      templateHasUrlButton: true,
    }).send(message);

    const components = bodyOf(spy).template.components;
    const button = components.find((c: { type: string }) => c.type === 'button');

    expect(button).toMatchObject({ sub_type: 'url', index: '0' });
    expect(button.parameters[0].text).toBe('abc123');

    // The body keeps only its own four values; the link lives in the button.
    const bodyComponent = components.find((c: { type: string }) => c.type === 'body');
    expect(bodyComponent.parameters).toHaveLength(4);
  });

  it('omits the button when the template does not declare one', async () => {
    const spy = stubFetch(200, { messages: [{ id: 'wamid.5' }] });

    await new MetaCloudNotificationProvider({ ...BASE, templateName: 't' }).send(message);

    const components = bodyOf(spy).template.components;
    expect(components.some((c: { type: string }) => c.type === 'button')).toBe(false);
  });
});

describe('toMetaAddress', () => {
  it('drops the Argentine mobile 9, which Meta does not register', async () => {
    const { toMetaAddress } = await import(
      '../src/modules/notifications/infrastructure/providers/meta-cloud.provider.js'
    );

    // What the console shows as the verified recipient: 543584181872.
    expect(toMetaAddress('+5493584181872')).toBe('543584181872');
    expect(toMetaAddress('+5491144445555')).toBe('541144445555');
  });

  it('leaves every other country untouched', async () => {
    const { toMetaAddress } = await import(
      '../src/modules/notifications/infrastructure/providers/meta-cloud.provider.js'
    );

    expect(toMetaAddress('+34600111222')).toBe('34600111222');
    expect(toMetaAddress('+16505551234')).toBe('16505551234');
  });
});
