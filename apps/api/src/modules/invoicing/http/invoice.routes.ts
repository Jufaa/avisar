import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { InvoicingStatusDto } from '@avisar/shared';
import { prisma } from '../../../shared/prisma.js';
import { authOf, requireAuth } from '../../../shared/http/auth.js';
import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { PrismaInvoiceRepository } from '../infrastructure/prisma-invoice.repository.js';
import { invoiceProvider } from '../infrastructure/providers/index.js';
import { draftInvoice } from '../application/draft-invoice.js';
import { issueInvoice } from '../application/issue-invoice.js';
import { isValidCuit } from '../domain/invoice-rules.js';

const profileBody = z.object({
  taxId: z.string().trim().min(11, 'Enter the CUIT'),
  legalName: z.string().trim().min(2, 'Enter the registered name'),
  taxCondition: z.enum(['MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'EXENTO']),
  salesPoint: z.coerce.number().int().min(1).max(99999),
  address: z.string().trim().max(255).nullish(),
  grossIncomeId: z.string().trim().nullish(),
  activityStartedOn: z.string().trim().nullish(),
});

const lineBody = z.object({
  description: z.string().trim().min(4, 'Describe the item in at least 4 characters').max(255),
  quantity: z.coerce.number().positive('Quantity must be greater than zero'),
  unitPrice: z.coerce.number().min(0, 'Price cannot be negative'),
  vatRate: z.coerce.number().default(21),
});

const draftBody = z.object({
  receiverName: z.string().trim().min(2, 'Enter who the invoice is for'),
  receiverDocKind: z.enum(['CUIT', 'CUIL', 'DNI', 'SIN_IDENTIFICAR']),
  receiverDocNumber: z.string().trim().default(''),
  receiverTaxCondition: z.enum([
    'RESPONSABLE_INSCRIPTO',
    'MONOTRIBUTO',
    'CONSUMIDOR_FINAL',
    'EXENTO',
  ]),
  receiverAddress: z.string().trim().max(255).nullish(),
  lines: z.array(lineBody).min(1, 'Add at least one item'),
  issuedOn: z.string().trim().optional(),
  patientId: z.string().uuid().nullish(),
  appointmentId: z.string().uuid().nullish(),
});

const listQuery = z.object({
  status: z.enum(['DRAFT', 'ISSUING', 'ISSUED', 'FAILED', 'VOID']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  const repository = new PrismaInvoiceRepository(prisma);

  app.addHook('preHandler', requireAuth);

  // --- provider status -----------------------------------------------------

  app.get('/invoicing/status', async (request) => {
    const { organizationId } = authOf(request);
    const provider = invoiceProvider();
    const profile = await repository.findProfile(organizationId);

    const status: InvoicingStatusDto = {
      provider: provider.name,
      live: provider.live,
      configured: profile !== null,
      // Said plainly, on every screen. Believing a simulation was a real
      // invoice is the worst thing this module could let happen.
      description: provider.live
        ? 'Las facturas se emiten en ARCA y tienen validez fiscal.'
        : 'Modo de prueba: se simula el CAE y NO se emite ninguna factura real.',
    };

    return status;
  });

  // --- tax details ---------------------------------------------------------

  app.get('/billing-profile', async (request) => {
    const { organizationId } = authOf(request);
    return repository.findProfile(organizationId);
  });

  app.put('/billing-profile', async (request) => {
    const { organizationId } = authOf(request);
    const body = profileBody.parse(request.body);

    const taxId = body.taxId.replace(/\D/g, '');
    // Checked here rather than relayed from ARCA: a typo in the practice's own
    // CUIT would otherwise surface as a rejection on the first real invoice.
    if (!isValidCuit(taxId)) throw new ValidationError('That CUIT is not valid');

    return repository.saveProfile(organizationId, {
      taxId,
      legalName: body.legalName,
      taxCondition: body.taxCondition,
      salesPoint: body.salesPoint,
      address: body.address || null,
      grossIncomeId: body.grossIncomeId || null,
      activityStartedOn: body.activityStartedOn ? new Date(body.activityStartedOn) : null,
    });
  });

  // --- invoices ------------------------------------------------------------

  app.get('/invoices', async (request) => {
    const { organizationId } = authOf(request);
    const query = listQuery.parse(request.query);
    return repository.list(organizationId, query);
  });

  app.get<{ Params: { id: string } }>('/invoices/:id', async (request) => {
    const { organizationId } = authOf(request);
    const found = await repository.findById(organizationId, request.params.id);
    if (!found) throw new NotFoundError('Invoice');
    return found;
  });

  /** Builds and stores a draft. Nothing fiscal happens here. */
  app.post('/invoices', async (request, reply) => {
    const { organizationId } = authOf(request);
    const body = draftBody.parse(request.body);

    const created = await draftInvoice(
      organizationId,
      {
        ...body,
        issuedOn: body.issuedOn ? new Date(body.issuedOn) : undefined,
      },
      repository,
    );

    return reply.status(201).send(created);
  });

  /**
   * The one endpoint that creates a fiscal document.
   *
   * Separate from the draft on purpose: it takes an id that already exists,
   * which means somebody saw the numbers before this was called.
   */
  app.post<{ Params: { id: string } }>('/invoices/:id/issue', async (request) => {
    const { organizationId } = authOf(request);

    return issueInvoice(organizationId, request.params.id, {
      repository,
      provider: invoiceProvider(),
    });
  });

  app.delete<{ Params: { id: string } }>('/invoices/:id', async (request, reply) => {
    const { organizationId } = authOf(request);

    const found = await repository.findById(organizationId, request.params.id);
    if (!found) throw new NotFoundError('Invoice');
    if (found.status === 'ISSUED') {
      throw new ValidationError(
        'An issued invoice cannot be deleted. It exists at ARCA, and it is cancelled with a credit note.',
      );
    }

    await repository.deleteDraft(organizationId, request.params.id);
    return reply.status(204).send();
  });
}
