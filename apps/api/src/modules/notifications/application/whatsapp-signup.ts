import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../../config/env.js';
import { AppError, ConflictError, ValidationError } from '../../../shared/errors.js';
import { encryptProviderCredential } from '../../invoicing/infrastructure/credential-encryption.js';
import type { WhatsAppConnectionRepository } from '../domain/whatsapp-connection.repository.js';
import { MetaEmbeddedSignup } from '../infrastructure/meta-embedded-signup.js';

export function whatsappSignupAvailable(): boolean {
  return Boolean(env.META_APP_ID && env.META_SIGNUP_CONFIG_ID && env.META_APP_SECRET
    && env.META_WEBHOOK_VERIFY_TOKEN && env.INVOICING_CREDENTIAL_ENCRYPTION_KEY);
}

function requireSignup(): void {
  if (!whatsappSignupAvailable()) {
    throw new AppError(503, 'WHATSAPP_SIGNUP_UNAVAILABLE', 'Guided WhatsApp connection is not configured yet');
  }
}

function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export async function beginWhatsAppSignup(organizationId: string, repository: WhatsAppConnectionRepository) {
  requireSignup();
  const state = randomBytes(32).toString('base64url');
  await repository.beginSignup(organizationId, hashState(state), new Date(Date.now() + 10 * 60_000));
  return { state, appId: env.META_APP_ID!, configId: env.META_SIGNUP_CONFIG_ID!, graphVersion: env.META_API_VERSION };
}

export async function completeWhatsAppSignup(
  organizationId: string,
  input: { state: string; code: string; wabaId: string; phoneNumberId: string },
  repository: WhatsAppConnectionRepository,
): Promise<void> {
  requireSignup();
  const stateHash = hashState(input.state);
  if (!await repository.consumeSignup(organizationId, stateHash, new Date())) {
    throw new ValidationError('This WhatsApp connection attempt expired or was already used. Start again.');
  }
  const meta = new MetaEmbeddedSignup({
    appId: env.META_APP_ID!, appSecret: env.META_APP_SECRET!, apiVersion: env.META_API_VERSION,
  });
  const connection = await meta.connect(input.code, input.wabaId, input.phoneNumberId);
  const saved = await repository.completeSignup(organizationId, stateHash, {
    encryptedAccessToken: encryptProviderCredential(
      connection.accessToken, organizationId, env.INVOICING_CREDENTIAL_ENCRYPTION_KEY!,
    ),
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    displayPhoneNumber: connection.displayPhoneNumber,
  });
  if (!saved) throw new ConflictError('The WhatsApp connection attempt was replaced or disconnected. Start again.');
}
