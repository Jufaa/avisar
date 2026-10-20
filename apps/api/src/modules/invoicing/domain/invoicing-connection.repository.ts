export type InvoiceEnvironment = 'homologacion' | 'produccion';

export interface InvoicingConnection {
  encryptedApiKey: string;
  environment: InvoiceEnvironment;
}

export interface InvoicingConnectionRepository {
  find(organizationId: string): Promise<InvoicingConnection | null>;
  save(
    organizationId: string,
    encryptedApiKey: string,
    environment: InvoiceEnvironment,
  ): Promise<void>;
  delete(organizationId: string): Promise<void>;
}
