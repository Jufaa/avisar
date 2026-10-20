import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { InvoicingStatusDto } from '@avisar/shared';
import { prisma } from '../../../shared/prisma.js';
import { authOf, requireAuth } from '../../../shared/http/auth.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { PrismaInvoiceRepository } from '../infrastructure/prisma-invoice.repository.js';
import { invoiceProviderForOrganization } from '../infrastructure/providers/index.js';
import { env } from '../../../config/env.js';
import { encryptProviderCredential, decryptProviderCredential } from '../infrastructure/credential-encryption.js';
import { PrismaInvoicingConnectionRepository } from '../infrastructure/prisma-invoicing-connection.repository.js';
import { draftInvoice } from '../application/draft-invoice.js';
import { issueInvoice } from '../application/issue-invoice.js';
import { isValidCuit } from '../domain/invoice-rules.js';
import { parseInvoiceRequest } from '../domain/parse-invoice-request.js';

const profileBody = z.object({
  taxId: z.string().trim().min(11, 'Enter the CUIT'),
  legalName: z.string().trim().min(2, 'Enter the registered name'),
  taxCondition: z.enum(['MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'EXENTO']),
  salesPoint: z.coerce.number().int().min(1).max(99999),
  address: z.string().trim().max(255).nullish(),
  grossIncomeId: z.string().trim().nullish(),
  activityStartedOn: z.string().trim().nullish(),
});

const connectionBody = z.object({
  apiKey: z.string().trim().min(1).max(512).optional(),
  environment: z.enum(['homologacion', 'produccion']),
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

const parseBody = z.object({
  text: z.string().trim().min(3, 'Escribí qué querés facturar').max(500),
});

const listQuery = z.object({
  status: z.enum(['DRAFT', 'ISSUING', 'ISSUED', 'FAILED', 'VOID']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  const repository = new PrismaInvoiceRepository(prisma);
  const connectionRepository = new PrismaInvoicingConnectionRepository(prisma);

  app.addHook('preHandler', requireAuth);

  // --- provider status -----------------------------------------------------

  app.get('/invoicing/status', async (request) => {
    const { organizationId } = authOf(request);
    const savedConnection = await connectionRepository.find(organizationId);
    const connection = usableConnection(savedConnection, organizationId);
    const provider = invoiceProviderForOrganization(organizationId, connection);
    const profile = await repository.findProfile(organizationId);
    const configured = profile !== null && provider.name !== 'unavailable'
      && (provider.name !== 'arca_api' || connection !== null);

    const status: InvoicingStatusDto = {
      provider: provider.name,
      live: provider.live,
      configured,
      // Said plainly, on every screen. Believing a simulation was a real
      // invoice is the worst thing this module could let happen.
      description:
        provider.name === 'unavailable'
          ? 'La facturación está disponible, pero falta configurar un proveedor real para emitir comprobantes.'
          : provider.name === 'arca_api' && provider.live
          ? 'Las facturas se emiten en ARCA y tienen validez fiscal.'
          : provider.name === 'arca_api'
            ? 'Modo de homologación: las facturas son de prueba y NO tienen validez fiscal.'
            : provider.live
              ? 'Las facturas se emiten en ARCA y tienen validez fiscal.'
              : 'Modo de prueba: se simula el CAE y NO se emite ninguna factura real.',
    };

    return status;
  });

  // --- customer-owned provider connection ---------------------------------

  app.get('/invoicing/connection', async (request) => {
    const { organizationId } = authOf(request);
    const saved = await connectionRepository.find(organizationId);
    const connection = usableConnection(saved, organizationId);

    return {
      available: env.INVOICING_PROVIDER === 'arca_api',
      configured: connection !== null,
      reconnectRequired: saved !== null && connection === null,
      environment: saved?.environment ?? 'homologacion',
    };
  });

  app.put('/invoicing/connection', async (request) => {
    const { organizationId } = authOf(request);
    if (env.INVOICING_PROVIDER !== 'arca_api') {
      throw new ConflictError('La conexión con ARCA {API} no está habilitada en esta instalación.');
    }

    const body = connectionBody.parse(request.body);
    const existing = await connectionRepository.find(organizationId);
    if (!body.apiKey && !existing) {
      throw new ValidationError('Pegá la API key de tu cuenta para conectarla.');
    }

    if (
      !body.apiKey &&
      existing &&
      !usableConnection(existing, organizationId)
    ) {
      throw new ValidationError('La conexión guardada no se puede leer. Pegá nuevamente tu API key.');
    }

    const encryptedApiKey = body.apiKey
      ? encryptProviderCredential(
          body.apiKey,
          organizationId,
          env.INVOICING_CREDENTIAL_ENCRYPTION_KEY!,
        )
      : existing!.encryptedApiKey;

    await connectionRepository.save(organizationId, encryptedApiKey, body.environment);
    return { configured: true, environment: body.environment };
  });

  app.delete('/invoicing/connection', async (request) => {
    const { organizationId } = authOf(request);
    await connectionRepository.delete(organizationId);
    return { configured: false };
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

  /**
   * Reads a sentence and fills in what it can.
   *
   * It creates nothing and stores nothing: the answer goes into the form, and
   * a person still confirms it. Living behind an endpoint rather than in the
   * browser is what lets a model replace the parser later without the client
   * noticing.
   */
  app.post('/invoices/parse', async (request) => {
    const body = parseBody.parse(request.body);
    return parseInvoiceRequest(body.text);
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
    const savedConnection = await connectionRepository.find(organizationId);
    const connection = usableConnection(savedConnection, organizationId);

    return issueInvoice(organizationId, request.params.id, {
      repository,
      provider: invoiceProviderForOrganization(organizationId, connection),
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

function usableConnection(
  connection: Awaited<ReturnType<PrismaInvoicingConnectionRepository['find']>>,
  organizationId: string,
) {
  if (!connection || env.INVOICING_PROVIDER !== 'arca_api') return null;
  try {
    decryptProviderCredential(
      connection.encryptedApiKey,
      organizationId,
      env.INVOICING_CREDENTIAL_ENCRYPTION_KEY!,
    );
    return connection;
  } catch {
    return null;
  }
}
