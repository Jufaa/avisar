import type {
  BillingProfileDto,
  DocumentKind,
  InvoiceDto,
  InvoiceStatus,
  InvoiceType,
  ReceiverTaxCondition,
} from '@avisar/shared';
import type { IssuedInvoice } from './invoice-provider.js';
import type { CalculatedLine } from './invoice-rules.js';

export interface DraftInvoiceInput {
  type: InvoiceType;
  salesPoint: number;
  issuedOn: Date;
  receiverName: string;
  receiverDocKind: DocumentKind;
  receiverDocNumber: string;
  receiverTaxCondition: ReceiverTaxCondition;
  receiverAddress: string | null;
  lines: CalculatedLine[];
  subtotal: number;
  vatAmount: number;
  total: number;
  patientId: string | null;
  appointmentId: string | null;
}

export interface InvoiceListQuery {
  status?: InvoiceStatus;
  limit: number;
  offset: number;
}

export interface InvoiceListResult {
  items: InvoiceDto[];
  total: number;
}

export interface BillingProfileInput {
  taxId: string;
  legalName: string;
  taxCondition: BillingProfileDto['taxCondition'];
  salesPoint: number;
  address: string | null;
  grossIncomeId: string | null;
  activityStartedOn: Date | null;
}

export interface InvoiceRepository {
  findProfile(organizationId: string): Promise<BillingProfileDto | null>;
  saveProfile(organizationId: string, input: BillingProfileInput): Promise<BillingProfileDto>;

  list(organizationId: string, query: InvoiceListQuery): Promise<InvoiceListResult>;
  findById(organizationId: string, id: string): Promise<InvoiceDto | null>;

  createDraft(organizationId: string, input: DraftInvoiceInput): Promise<InvoiceDto>;
  deleteDraft(organizationId: string, id: string): Promise<void>;

  /**
   * Moves a claimable invoice to ISSUING and returns whether this caller won
   * the race.
   *
   * Two tabs pressing "Emitir" on the same draft must not produce two fiscal
   * documents. The state transition is the lock: only the caller that finds
   * the row still claimable (DRAFT or FAILED) is allowed to talk to ARCA.
   */
  claimForIssue(organizationId: string, id: string): Promise<boolean>;

  markIssued(id: string, result: IssuedInvoice): Promise<InvoiceDto>;
  markFailed(id: string, error: string): Promise<InvoiceDto>;

  /**
   * Returns rows left in ISSUING by a process that died mid-issue.
   *
   * These are never retried automatically: ARCA may already have authorised
   * the document, and a blind retry is how one consultation becomes two
   * invoices. A human reconciles them.
   */
  findStalled(organizationId: string, olderThanMinutes: number): Promise<InvoiceDto[]>;
}
