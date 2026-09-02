import { beforeEach, describe, expect, it } from 'vitest';
import type { BillingProfileDto, InvoiceDto } from '@avisar/shared';
import { issueInvoice } from '../src/modules/invoicing/application/issue-invoice.js';
import { FakeInvoiceProvider } from '../src/modules/invoicing/infrastructure/providers/fake.provider.js';
import type {
  InvoiceProvider,
  IssueResult,
} from '../src/modules/invoicing/domain/invoice-provider.js';
import type { InvoiceRepository } from '../src/modules/invoicing/domain/invoice.repository.js';

const PROFILE: BillingProfileDto = {
  taxId: '20358418180',
  legalName: 'Centro de Kinesiología Belgrano',
  taxCondition: 'MONOTRIBUTO',
  salesPoint: 3,
  address: 'Belgrano 1234, Río Cuarto',
  grossIncomeId: null,
  activityStartedOn: null,
};

function draft(overrides: Partial<InvoiceDto> = {}): InvoiceDto {
  return {
    id: 'invoice-1',
    type: 'C',
    status: 'DRAFT',
    salesPoint: 3,
    number: null,
    displayNumber: null,
    issuedOn: '2026-09-02',
    receiverName: 'Juan Pérez',
    receiverDocKind: 'DNI',
    receiverDocNumber: '35841818',
    receiverTaxCondition: 'CONSUMIDOR_FINAL',
    receiverAddress: null,
    subtotal: 50000,
    vatAmount: 0,
    total: 50000,
    currency: 'ARS',
    cae: null,
    caeExpiresOn: null,
    pdfUrl: null,
    error: null,
    patientId: null,
    appointmentId: null,
    items: [],
    createdAt: '2026-09-02T00:00:00.000Z',
    issuedAt: null,
    ...overrides,
  };
}

/**
 * In-memory stand-in for the invoice store.
 *
 * The use case depends on the repository interface, so the fiscal safety
 * rules — claim once, never issue twice, keep the rejection — are testable
 * without Postgres and without an account at ARCA.
 */
class InMemoryInvoiceRepository implements Partial<InvoiceRepository> {
  invoice: InvoiceDto = draft();
  claims = 0;

  async findProfile(): Promise<BillingProfileDto | null> {
    return PROFILE;
  }

  async findById(): Promise<InvoiceDto | null> {
    return this.invoice;
  }

  async claimForIssue(): Promise<boolean> {
    // Mirrors the real UPDATE ... WHERE status IN (DRAFT, FAILED): only the
    // first caller finds the row claimable.
    if (this.invoice.status !== 'DRAFT' && this.invoice.status !== 'FAILED') return false;
    this.invoice = { ...this.invoice, status: 'ISSUING' };
    this.claims += 1;
    return true;
  }

  async markIssued(_id: string, result: { cae: string; number: number }): Promise<InvoiceDto> {
    this.invoice = {
      ...this.invoice,
      status: 'ISSUED',
      cae: result.cae,
      number: result.number,
      issuedAt: new Date().toISOString(),
      error: null,
    };
    return this.invoice;
  }

  async markFailed(_id: string, error: string): Promise<InvoiceDto> {
    this.invoice = { ...this.invoice, status: 'FAILED', error };
    return this.invoice;
  }
}

function repositoryOf(repo: InMemoryInvoiceRepository): InvoiceRepository {
  return repo as unknown as InvoiceRepository;
}

class RejectingProvider implements InvoiceProvider {
  readonly name = 'rejecting';
  readonly live = false;
  calls = 0;

  async issue(): Promise<IssueResult> {
    this.calls += 1;
    return { ok: false, error: 'El CUIT del receptor no existe en ARCA', retryable: false };
  }
}

describe('issueInvoice', () => {
  let repository: InMemoryInvoiceRepository;
  let provider: FakeInvoiceProvider;

  beforeEach(() => {
    repository = new InMemoryInvoiceRepository();
    provider = new FakeInvoiceProvider(async () => 1);
  });

  it('issues a draft and records the CAE', async () => {
    const result = await issueInvoice('org-1', 'invoice-1', {
      repository: repositoryOf(repository),
      provider,
    });

    expect(result.status).toBe('ISSUED');
    expect(result.cae).toMatch(/^\d{14}$/);
    expect(result.number).toBe(1);
  });

  it('returns the same document instead of issuing a second one', async () => {
    await issueInvoice('org-1', 'invoice-1', {
      repository: repositoryOf(repository),
      provider,
    });

    const again = await issueInvoice('org-1', 'invoice-1', {
      repository: repositoryOf(repository),
      provider,
    });

    // The one guarantee this module cannot break: one consultation, one
    // fiscal document. A second claim would mean a second CAE.
    expect(repository.claims).toBe(1);
    expect(again.status).toBe('ISSUED');
  });

  it('refuses to touch an invoice another request is already issuing', async () => {
    repository.invoice = draft({ status: 'ISSUING' });

    await expect(
      issueInvoice('org-1', 'invoice-1', { repository: repositoryOf(repository), provider }),
    ).rejects.toThrow(/already being issued/);

    expect(repository.claims).toBe(0);
  });

  it('keeps a rejection on the row instead of throwing it away', async () => {
    const rejecting = new RejectingProvider();

    const result = await issueInvoice('org-1', 'invoice-1', {
      repository: repositoryOf(repository),
      provider: rejecting,
    });

    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('CUIT');
  });

  it('lets a rejected invoice be retried once it is fixed', async () => {
    repository.invoice = draft({ status: 'FAILED', error: 'El CUIT del receptor no existe' });

    const result = await issueInvoice('org-1', 'invoice-1', {
      repository: repositoryOf(repository),
      provider,
    });

    expect(result.status).toBe('ISSUED');
    expect(result.error).toBeNull();
  });

  it('never leaves the row locked when the adapter throws', async () => {
    const throwing: InvoiceProvider = {
      name: 'throwing',
      live: false,
      issue: () => Promise.reject(new Error('socket hang up')),
    };

    const result = await issueInvoice('org-1', 'invoice-1', {
      repository: repositoryOf(repository),
      provider: throwing,
    });

    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('socket hang up');
  });

  it('refuses to issue a voided invoice', async () => {
    repository.invoice = draft({ status: 'VOID' });

    await expect(
      issueInvoice('org-1', 'invoice-1', { repository: repositoryOf(repository), provider }),
    ).rejects.toThrow(/voided/);
  });
});
