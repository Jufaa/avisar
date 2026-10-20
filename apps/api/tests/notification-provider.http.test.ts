import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const state = vi.hoisted(() => ({
  provider: { name: 'meta', live: true },
  tenantRead: vi.fn(),
  tenantMutation: vi.fn(),
  signup: vi.fn(),
  testSend: vi.fn(),
  env: {
    META_TEMPLATE_NAME: 'recordatorio_turno' as string | undefined,
    META_TEMPLATE_LANGUAGE: 'es_AR',
    TWILIO_CONTENT_SID: undefined as string | undefined,
  },
}));

vi.mock('../src/config/env.js', () => ({ env: state.env }));
vi.mock('../src/shared/prisma.js', () => ({ prisma: {} }));
vi.mock('../src/shared/http/auth.js', () => ({
  requireAuth: async () => {},
  authOf: () => ({ organizationId: 'test-organization' }),
}));
vi.mock('../src/modules/notifications/infrastructure/providers/index.js', () => ({
  notificationProvider: () => state.provider,
}));
vi.mock('../src/modules/notifications/infrastructure/prisma-whatsapp-connection.repository.js', () => ({
  PrismaWhatsAppConnectionRepository: class {
    find = state.tenantRead;
    disconnect = state.tenantMutation;
  },
}));
vi.mock('../src/modules/notifications/application/whatsapp-signup.js', () => ({
  whatsappSignupAvailable: () => true,
  beginWhatsAppSignup: state.signup,
  completeWhatsAppSignup: state.signup,
}));

vi.mock('../src/modules/notifications/application/send-test-message.js', () => ({
  sendTestMessage: state.testSend,
}));

const { notificationRoutes } = await import('../src/modules/notifications/http/notification.routes.js');

describe('notification provider status', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    state.provider = { name: 'meta', live: true };
    state.env.META_TEMPLATE_NAME = 'recordatorio_turno';
    state.env.TWILIO_CONTENT_SID = undefined;
    app = Fastify();
    await app.register(notificationRoutes);
  });

  afterEach(async () => {
    await app.close();
  });

  it('identifies Meta template delivery and preserves the existing status fields', async () => {
    const response = await app.inject('/notifications/provider');

    expect(state.tenantRead).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: 'meta',
      live: true,
      description: 'Los mensajes se envían por WhatsApp.',
      whatsapp: {
        connected: true,
        displayPhoneNumber: null,
        signupAvailable: false,
      },
      messageTemplate: { name: 'recordatorio_turno', language: 'es_AR' },
    });
  });

  it('keeps Meta free-text delivery distinct from approved templates', async () => {
    state.env.META_TEMPLATE_NAME = undefined;
    const response = await app.inject('/notifications/provider');

    expect(response.statusCode).toBe(200);
    expect(response.json().messageTemplate).toBeNull();
  });

  it('does not apply a configured live template to a simulated provider', async () => {
    state.provider = { name: 'console', live: false };
    const response = await app.inject('/notifications/provider');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: 'console',
      live: false,
      messageTemplate: null,
      whatsapp: { connected: false },
    });
  });

  it('also identifies approved Twilio content instead of showing a free-text editor', async () => {
    state.provider = { name: 'twilio', live: true };
    state.env.TWILIO_CONTENT_SID = `HX${'1'.repeat(32)}`;
    const response = await app.inject('/notifications/provider');

    expect(response.statusCode).toBe(200);
    expect(response.json().messageTemplate).toEqual({
      name: state.env.TWILIO_CONTENT_SID,
      language: null,
    });
  });

  it('reports missing central configuration without presenting simulation', async () => {
    state.provider = { name: 'unavailable', live: false };
    const response = await app.inject('/notifications/provider');
    expect(response.json()).toMatchObject({
      name: 'unavailable', live: false, messageTemplate: null,
      description: 'El servicio de WhatsApp de Avisar está pendiente de configuración.',
      whatsapp: { connected: false, displayPhoneNumber: null, signupAvailable: false },
    });
    expect(state.tenantRead).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', '/notifications/whatsapp/signup'],
    ['POST', '/notifications/whatsapp/complete'],
    ['DELETE', '/notifications/whatsapp/connection'],
    ['POST', '/notifications/test'],
  ] as const)('rejects professional mutations on %s %s before any side effect', async (method, url) => {
    const response = await app.inject({ method, url, payload: {} });
    expect(response.statusCode).toBe(403);
    expect(state.tenantRead).not.toHaveBeenCalled();
    expect(state.tenantMutation).not.toHaveBeenCalled();
    expect(state.signup).not.toHaveBeenCalled();
    expect(state.testSend).not.toHaveBeenCalled();
  });

});
