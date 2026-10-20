import { AppError, ValidationError } from '../../../shared/errors.js';

interface SignupConfig {
  appId: string;
  appSecret: string;
  apiVersion: string;
}

interface PhoneNumber {
  id: string;
  display_phone_number: string;
}

/** Only the server exchanges the short-lived code for a business token. */
export class MetaEmbeddedSignup {
  constructor(private readonly config: SignupConfig) {}

  async connect(code: string, wabaId: string, phoneNumberId: string): Promise<{
    accessToken: string;
    displayPhoneNumber: string;
  }> {
    const query = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      code,
    });
    const exchanged = await this.request(`oauth/access_token?${query}`);
    if (typeof exchanged.access_token !== 'string' || !exchanged.access_token) {
      throw metaError();
    }
    const accessToken = exchanged.access_token;

    // Neither browser-provided id is trusted. The WABA must be visible to
    // this token, and the phone must appear under that exact WABA's edge.
    const waba = await this.request(`${wabaId}?fields=id`, accessToken);
    if (waba.id !== wabaId) throw new ValidationError('The WhatsApp Business account could not be verified');

    const phone = await this.findPhone(wabaId, phoneNumberId, accessToken);
    if (!phone) throw new ValidationError('The selected phone does not belong to this WhatsApp Business account');

    const subscription = await this.request(`${wabaId}/subscribed_apps`, accessToken, 'POST');
    if (subscription.success !== true) throw metaError();

    return { accessToken, displayPhoneNumber: phone.display_phone_number };
  }

  private async findPhone(wabaId: string, phoneNumberId: string, accessToken: string): Promise<PhoneNumber | null> {
    let after: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const query = new URLSearchParams({ fields: 'id,display_phone_number', limit: '100' });
      if (after) query.set('after', after);
      const result = await this.request(`${wabaId}/phone_numbers?${query}`, accessToken);
      if (!Array.isArray(result.data)) throw metaError();
      for (const item of result.data as unknown[]) {
        if (!item || typeof item !== 'object') continue;
        const phone = item as Partial<PhoneNumber>;
        if (phone.id === phoneNumberId && typeof phone.display_phone_number === 'string') {
          return { id: phoneNumberId, display_phone_number: phone.display_phone_number };
        }
      }
      const paging = result.paging as { next?: unknown; cursors?: { after?: unknown } } | undefined;
      if (!paging?.next || typeof paging.cursors?.after !== 'string') return null;
      // Do not follow provider-supplied URLs carrying credentials or hosts.
      after = paging.cursors.after;
    }
    throw new ValidationError('The selected phone could not be verified; contact support');
  }

  private async request(path: string, accessToken?: string, method: 'GET' | 'POST' = 'GET'): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(`https://graph.facebook.com/${this.config.apiVersion}/${path}`, {
        method,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw metaError();
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result) || 'error' in result) throw metaError();
      return result as Record<string, unknown>;
    } catch {
      // OAuth URLs contain secrets. Never propagate network errors, request
      // URLs or Meta's response body into logs or client-visible errors.
      throw metaError();
    }
  }
}

function metaError(): AppError {
  return new AppError(502, 'WHATSAPP_SIGNUP_FAILED', 'WhatsApp could not verify the connection. Start the guided connection again.');
}
