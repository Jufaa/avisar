import type { DocumentKind, InvoiceDto, ReceiverTaxCondition } from '@avisar/shared';
import { ValidationError } from '../../../shared/errors.js';
import type { DraftLineInput } from '../domain/invoice-rules.js';
import {
  assertReceiverIsInvoiceable,
  calculateInvoice,
  resolveInvoiceType,
} from '../domain/invoice-rules.js';
import type { InvoiceRepository } from '../domain/invoice.repository.js';

export interface DraftInvoiceCommand {
  receiverName: string;
  receiverDocKind: DocumentKind;
  receiverDocNumber: string;
  receiverTaxCondition: ReceiverTaxCondition;
  receiverAddress?: string | null;
  lines: DraftLineInput[];
  issuedOn?: Date;
  patientId?: string | null;
  appointmentId?: string | null;
}

/**
 * Builds an invoice and stores it, without emitting anything.
 *
 * This half of the flow exists so a human can look at the numbers before they
 * become a fiscal document. Natural language, a dictated audio or a form all
 * end here: whatever filled the fields, somebody still confirms them.
 *
 * Nothing in this function talks to ARCA, and that is the point.
 */
export async function draftInvoice(
  organizationId: string,
  command: DraftInvoiceCommand,
  repository: InvoiceRepository,
): Promise<InvoiceDto> {
  const profile = await repository.findProfile(organizationId);

  if (!profile) {
    throw new ValidationError(
      'Load the practice tax details before invoicing (CUIT, condition and point of sale)',
    );
  }

  // Derived, never chosen: a monotributista offered "A" in a dropdown would be
  // issuing an invalid document, and the dropdown would be to blame.
  const type = resolveInvoiceType(profile.taxCondition, command.receiverTaxCondition);

  assertReceiverIsInvoiceable(
    command.receiverDocKind,
    command.receiverDocNumber,
    command.receiverTaxCondition,
  );

  const calculated = calculateInvoice(type, command.lines);

  return repository.createDraft(organizationId, {
    type,
    salesPoint: profile.salesPoint,
    issuedOn: command.issuedOn ?? new Date(),
    receiverName: command.receiverName.trim(),
    receiverDocKind: command.receiverDocKind,
    receiverDocNumber: command.receiverDocNumber.replace(/\D/g, ''),
    receiverTaxCondition: command.receiverTaxCondition,
    receiverAddress: command.receiverAddress?.trim() || null,
    lines: calculated.lines,
    subtotal: calculated.subtotal,
    vatAmount: calculated.vatAmount,
    total: calculated.total,
    patientId: command.patientId ?? null,
    appointmentId: command.appointmentId ?? null,
  });
}
