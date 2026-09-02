import type { BillingProfile, Invoice, InvoiceItem, Prisma, PrismaClient } from '@prisma/client';
import type { BillingProfileDto, InvoiceDto } from '@avisar/shared';
import type { IssuedInvoice } from '../domain/invoice-provider.js';
import { formatInvoiceNumber } from '../domain/invoice-rules.js';
import type {
  BillingProfileInput,
  DraftInvoiceInput,
  InvoiceListQuery,
  InvoiceListResult,
  InvoiceRepository,
} from '../domain/invoice.repository.js';

type InvoiceWithItems = Invoice & { items: InvoiceItem[] };

/**
 * Decimal to number, at the single point where the value stops being money
 * and becomes JSON. Postgres holds the authoritative figure; this is the copy
 * the browser reads.
 */
function amount(value: Prisma.Decimal): number {
  return value.toNumber();
}

export function toInvoiceDto(invoice: InvoiceWithItems): InvoiceDto {
  return {
    id: invoice.id,
    type: invoice.type,
    status: invoice.status,
    salesPoint: invoice.salesPoint,
    number: invoice.number,
    displayNumber: formatInvoiceNumber(invoice.salesPoint, invoice.number),
    issuedOn: invoice.issuedOn.toISOString().slice(0, 10),
    receiverName: invoice.receiverName,
    receiverDocKind: invoice.receiverDocKind,
    receiverDocNumber: invoice.receiverDocNumber,
    receiverTaxCondition: invoice.receiverTaxCondition,
    receiverAddress: invoice.receiverAddress,
    subtotal: amount(invoice.subtotal),
    vatAmount: amount(invoice.vatAmount),
    total: amount(invoice.total),
    currency: invoice.currency,
    cae: invoice.cae,
    caeExpiresOn: invoice.caeExpiresOn ? invoice.caeExpiresOn.toISOString().slice(0, 10) : null,
    pdfUrl: invoice.pdfUrl,
    error: invoice.error,
    patientId: invoice.patientId,
    appointmentId: invoice.appointmentId,
    items: invoice.items
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        description: item.description,
        quantity: amount(item.quantity),
        unitPrice: amount(item.unitPrice),
        vatRate: amount(item.vatRate),
        subtotal: amount(item.subtotal),
        vatAmount: amount(item.vatAmount),
        total: amount(item.total),
      })),
    createdAt: invoice.createdAt.toISOString(),
    issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
  };
}

function toProfileDto(profile: BillingProfile): BillingProfileDto {
  return {
    taxId: profile.taxId,
    legalName: profile.legalName,
    taxCondition: profile.taxCondition,
    salesPoint: profile.salesPoint,
    grossIncomeId: profile.grossIncomeId,
    activityStartedOn: profile.activityStartedOn
      ? profile.activityStartedOn.toISOString().slice(0, 10)
      : null,
  };
}

export class PrismaInvoiceRepository implements InvoiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findProfile(organizationId: string): Promise<BillingProfileDto | null> {
    const found = await this.prisma.billingProfile.findUnique({ where: { organizationId } });
    return found ? toProfileDto(found) : null;
  }

  async saveProfile(organizationId: string, input: BillingProfileInput): Promise<BillingProfileDto> {
    const saved = await this.prisma.billingProfile.upsert({
      where: { organizationId },
      create: { organizationId, ...input },
      update: input,
    });
    return toProfileDto(saved);
  }

  async list(organizationId: string, query: InvoiceListQuery): Promise<InvoiceListResult> {
    const where: Prisma.InvoiceWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { items: rows.map(toInvoiceDto), total };
  }

  async findById(organizationId: string, id: string): Promise<InvoiceDto | null> {
    const found = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    return found ? toInvoiceDto(found) : null;
  }

  async createDraft(organizationId: string, input: DraftInvoiceInput): Promise<InvoiceDto> {
    const created = await this.prisma.invoice.create({
      data: {
        organizationId,
        type: input.type,
        status: 'DRAFT',
        salesPoint: input.salesPoint,
        issuedOn: input.issuedOn,
        receiverName: input.receiverName,
        receiverDocKind: input.receiverDocKind,
        receiverDocNumber: input.receiverDocNumber,
        receiverTaxCondition: input.receiverTaxCondition,
        receiverAddress: input.receiverAddress,
        subtotal: input.subtotal,
        vatAmount: input.vatAmount,
        total: input.total,
        patientId: input.patientId,
        appointmentId: input.appointmentId,
        items: {
          create: input.lines.map((line, position) => ({
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            vatRate: line.vatRate,
            subtotal: line.subtotal,
            vatAmount: line.vatAmount,
            total: line.total,
            position,
          })),
        },
      },
      include: { items: true },
    });

    return toInvoiceDto(created);
  }

  async deleteDraft(organizationId: string, id: string): Promise<void> {
    // Scoped in the query itself. An issued invoice is not deletable by any
    // path — it exists at ARCA, and deleting our row would not unmake it —
    // and enforcing that here means no caller can forget.
    await this.prisma.invoice.deleteMany({
      where: { id, organizationId, status: { in: ['DRAFT', 'FAILED'] } },
    });
  }

  async claimForIssue(organizationId: string, id: string): Promise<boolean> {
    // The state transition is the lock. Two tabs pressing "Emitir" both run
    // this; exactly one finds the row claimable and gets to call ARCA.
    //
    // FAILED is claimable too: it is a draft carrying a rejection, and the
    // whole point of showing that rejection is that someone fixes the CUIT
    // and presses the button again. Only ISSUING and ISSUED are closed.
    const claimed = await this.prisma.invoice.updateMany({
      where: { id, organizationId, status: { in: ['DRAFT', 'FAILED'] } },
      data: { status: 'ISSUING', attempts: { increment: 1 }, error: null },
    });

    return claimed.count === 1;
  }

  async markIssued(id: string, result: IssuedInvoice): Promise<InvoiceDto> {
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'ISSUED',
        cae: result.cae,
        caeExpiresOn: result.caeExpiresOn ? new Date(`${result.caeExpiresOn}T00:00:00Z`) : null,
        number: result.number,
        pdfUrl: result.pdfUrl,
        providerRef: result.providerRef,
        issuedAt: new Date(),
        error: null,
      },
      include: { items: true },
    });

    return toInvoiceDto(updated);
  }

  async markFailed(id: string, error: string): Promise<InvoiceDto> {
    const updated = await this.prisma.invoice.update({
      where: { id },
      // FAILED keeps the rejection attached to the row instead of throwing it
      // away, and stays claimable so the fix-and-retry loop is one button.
      data: { status: 'FAILED', error },
      include: { items: true },
    });

    return toInvoiceDto(updated);
  }

  async findStalled(organizationId: string, olderThanMinutes: number): Promise<InvoiceDto[]> {
    const floor = new Date(Date.now() - olderThanMinutes * 60_000);

    const rows = await this.prisma.invoice.findMany({
      where: { organizationId, status: 'ISSUING', updatedAt: { lt: floor } },
      include: { items: true },
      orderBy: { updatedAt: 'asc' },
    });

    return rows.map(toInvoiceDto);
  }
}
