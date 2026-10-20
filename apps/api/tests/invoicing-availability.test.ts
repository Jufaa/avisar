import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboundInvoice } from '../src/modules/invoicing/domain/invoice-provider.js';

describe('default invoicing availability', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('DOTENV_CONFIG_PATH', '/dev/null');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'postgresql://isolated:isolated@127.0.0.1:1/isolated');
    vi.stubEnv('JWT_SECRET', 'a'.repeat(64));
    vi.stubEnv('WEB_APP_URL', 'https://avisar.test');
    vi.stubEnv('SERVE_WEB', 'false');
    vi.stubEnv('NOTIFICATION_PROVIDER', 'console');
    vi.stubEnv('INVOICING_PROVIDER', 'fake');
    vi.stubEnv('INVOICING_ENABLED', undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('enables billing configuration and invoice routes without manual activation', async () => {
    const { env } = await import('../src/config/env.js');
    expect(env.INVOICING_ENABLED).toBe(true);

    const { buildApp } = await import('../src/app.js');
    const app = await buildApp();
    try {
      for (const url of ['/api/billing-profile', '/api/invoicing/connection', '/api/invoices']) {
        const response = await app.inject({ method: 'GET', url });
        // The route exists and still requires a session, without reaching a database.
        expect(response.statusCode, url).toBe(401);
      }
    } finally {
      await app.close();
    }
  });

  it('preserves an explicit deployment override', async () => {
    vi.stubEnv('INVOICING_ENABLED', 'false');
    const { env } = await import('../src/config/env.js');
    expect(env.INVOICING_ENABLED).toBe(false);
  });

  it('keeps production available with omitted invoicing settings and blocks simulated issuance', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('INVOICING_PROVIDER', undefined);
    const { env } = await import('../src/config/env.js');
    expect(env.INVOICING_ENABLED).toBe(true);

    const { buildApp } = await import('../src/app.js');
    const app = await buildApp();
    try {
      expect((await app.inject('/health')).statusCode).toBe(200);
      expect((await app.inject('/api/invoices')).statusCode).toBe(401);
    } finally {
      await app.close();
    }

    const { prisma } = await import('../src/shared/prisma.js');
    const lookup = vi.spyOn(prisma.invoice, 'findFirst').mockResolvedValue(null);
    const network = vi.spyOn(globalThis, 'fetch');
    const { invoiceProvider } = await import('../src/modules/invoicing/infrastructure/providers/index.js');
    const provider = invoiceProvider();
    const invoice: OutboundInvoice = {
      type: 'C',
      issuedOn: '2026-10-19',
      issuer: { taxId: '20358418180', legalName: 'Test issuer', salesPoint: 1 },
      receiver: {
        name: 'Test receiver', docKind: 'SIN_IDENTIFICAR', docNumber: '',
        taxCondition: 'CONSUMIDOR_FINAL', address: null,
      },
      lines: [{
        description: 'Test consultation', quantity: 1, unitPrice: 100,
        vatRate: 0, subtotal: 100, vatAmount: 0, total: 100,
      }],
      subtotal: 100,
      vatAmount: 0,
      total: 100,
      currency: 'ARS',
      reference: 'production-default-no-issuance',
    };

    expect(provider.name).toBe('unavailable');
    expect(provider.live).toBe(false);
    expect(await provider.issue(invoice)).toMatchObject({ ok: false, retryable: false });
    expect(lookup).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it('still refuses explicitly enabling the fake provider in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('INVOICING_ENABLED', 'true');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Invalid environment');
    });

    await expect(import('../src/config/env.js')).rejects.toThrow('Invalid environment');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('would issue simulated CAE numbers'));
  });
});
