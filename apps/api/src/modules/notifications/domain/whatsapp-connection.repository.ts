export interface WhatsAppConnection {
  status: 'CONNECTED' | 'DISCONNECTED';
  encryptedAccessToken: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
}

export interface WhatsAppConnectionRepository {
  find(organizationId: string): Promise<WhatsAppConnection | null>;
  beginSignup(organizationId: string, stateHash: string, expiresAt: Date): Promise<void>;
  consumeSignup(organizationId: string, stateHash: string, now: Date): Promise<boolean>;
  completeSignup(
    organizationId: string,
    stateHash: string,
    connection: Required<Pick<WhatsAppConnection, 'encryptedAccessToken' | 'wabaId' | 'phoneNumberId' | 'displayPhoneNumber'>>,
  ): Promise<boolean>;
  disconnect(organizationId: string): Promise<void>;
}
